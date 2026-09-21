/**
 * SillyTavern DB/Memory Extension
 * Database-backed memory with PostgreSQL + pgvector backend
 */

import { renderExtensionTemplateAsync, extension_settings, saveSettingsDebounced } from '../../../../script.js';
import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../../scripts/st-context.js';
import { toastr } from '../../../../lib.js';

const EXTENSION_NAME = 'db_memory';
const EXTENSION_FOLDER = 'third-party/sillytavern-db-memory-extension';
const TEMPLATE_PATH = `${EXTENSION_FOLDER}/assets/templates`;

// State
const state = {
    connected: false,
    backendUrl: '',
    username: '',
    password: '',
    jwtToken: null,
    tokenExpiry: null,
    settings: {
        autoSync: true,
        messagesPerSync: 10,
        memoriesPerContext: 5,
        similarityThreshold: 0.7,
        enableAutoExtraction: true,
        showRelevanceScores: true,
        debugMode: false
    },
    lastSyncedMessageId: null,
    processedMessages: new Set(),
    currentPage: 1,
    pageSize: 20
};

// Initialize extension settings
if (!extension_settings[EXTENSION_NAME]) {
    extension_settings[EXTENSION_NAME] = {
        backendUrl: '',
        username: '',
        password: '',
        jwtToken: null,
        tokenExpiry: null,
        settings: { ...state.settings }
    };
}

// Load state from extension_settings
function loadState() {
    const saved = extension_settings[EXTENSION_NAME];
    state.backendUrl = saved.backendUrl || '';
    state.username = saved.username || '';
    state.password = saved.password || '';
    state.jwtToken = saved.jwtToken || null;
    state.tokenExpiry = saved.tokenExpiry || null;
    if (saved.settings) {
        state.settings = { ...state.settings, ...saved.settings };
    }
}

// Save state to extension_settings
function saveState() {
    extension_settings[EXTENSION_NAME].backendUrl = state.backendUrl;
    extension_settings[EXTENSION_NAME].username = state.username;
    extension_settings[EXTENSION_NAME].password = state.password;
    extension_settings[EXTENSION_NAME].jwtToken = state.jwtToken;
    extension_settings[EXTENSION_NAME].tokenExpiry = state.tokenExpiry;
    extension_settings[EXTENSION_NAME].settings = { ...state.settings };
    saveSettingsDebounced();
}

// HTTP Client
function buildHeaders(extra) {
    const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
    if (state.jwtToken && !isTokenExpired()) {
        headers['Authorization'] = `Bearer ${state.jwtToken}`;
    }
    return headers;
}

function isTokenExpired() {
    if (!state.tokenExpiry) return false;
    return new Date() >= new Date(state.tokenExpiry);
}

async function request(path, options) {
    const url = `${state.backendUrl.replace(/\/$/, '')}${path}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);

    try {
        const resp = await fetch(url, {
            ...options,
            headers: buildHeaders(options.headers),
            signal: controller.signal
        });

        clearTimeout(id);

        if (!resp.ok) {
            let errBody;
            try { errBody = await resp.json(); } catch { errBody = null; }

            if ((resp.status === 401 || resp.status === 403) && state.jwtToken && !path.includes('/api/auth')) {
                await reLogin();
                return request(path, options);
            }

            throw new Error(errBody?.error || `HTTP ${resp.status}`);
        }

        if (resp.status === 204) return null;
        return await resp.json();
    } catch (err) {
        clearTimeout(id);
        if (err.name === 'AbortError') throw new Error('Request timeout');
        throw err;
    }
}

// Auth (JWT)
async function reLogin() {
    if (!state.username || !state.password) return;
    try {
        const data = await request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: state.username, password: state.password })
        });
        if (data?.token) {
            state.jwtToken = data.token;
            try {
                const payload = JSON.parse(atob(data.token.split('.')[1]));
                state.tokenExpiry = new Date(payload.exp * 1000).toISOString();
            } catch { }
            saveState();
        }
    } catch (e) {
        if (state.settings.debugMode) console.error('[DB Memory] Re-login failed:', e);
        state.connected = false;
        updateConnectionStatus();
        throw e;
    }
}

async function login() {
    if (state.jwtToken && !isTokenExpired()) {
        try {
            await request('/health', { method: 'GET' });
            state.connected = true;
            updateConnectionStatus();
            return true;
        } catch { }
    }
    await reLogin();
    state.connected = true;
    updateConnectionStatus();
    return true;
}

function logout() {
    state.jwtToken = null;
    state.tokenExpiry = null;
    state.connected = false;
    state.password = '';
    saveState();
    updateConnectionStatus();
}

async function testConnection() {
    await request('/health', { method: 'GET' });
    return true;
}

// Memories API
const MemoriesAPI = {
    async list(filters = {}) {
        const p = new URLSearchParams();
        if (filters.type) p.set('type', filters.type);
        if (filters.chatId) p.set('chatId', filters.chatId);
        if (filters.characterId) p.set('characterId', filters.characterId);
        if (filters.minImportance !== undefined) p.set('minImportance', filters.minImportance);
        if (filters.limit) p.set('limit', filters.limit);
        if (filters.offset) p.set('offset', filters.offset);
        const qs = p.toString();
        return request(`/api/memories${qs ? '?' + qs : ''}`, { method: 'GET' });
    },
    async process(content, opts = {}) {
        return request('/api/memories/process', {
            method: 'POST',
            body: JSON.stringify({
                content,
                role: opts.role || 'user',
                chatId: opts.chatId || null,
                characterId: opts.characterId || null,
                sourceMessageId: opts.sourceMessageId || null
            })
        });
    },
    async delete(id) {
        return request(`/api/memories/${id}`, { method: 'DELETE' });
    }
};

// Context API
const ContextAPI = {
    async build(query, opts = {}) {
        return request('/api/context', {
            method: 'POST',
            body: JSON.stringify({
                query,
                chatId: opts.chatId || null,
                characterId: opts.characterId || null,
                types: opts.types || [],
                memoryLimit: opts.memoryLimit ?? state.settings.memoriesPerContext,
                messageLimit: Math.min(state.settings.messagesPerSync * 2, 50),
                similarityThreshold: opts.similarityThreshold ?? state.settings.similarityThreshold,
                minImportance: opts.minImportance
            })
        });
    }
};

// UI Functions
function updateConnectionStatus() {
    const el = $('#db_memory_status_badge');
    if (!el.length) return;

    if (state.connected && state.jwtToken) {
        el.text('Connected').css({ background: '#4caf50', color: '#fff' });
    } else {
        el.text('Disconnected').css({ background: '#f44336', color: '#fff' });
    }
}

function showMessage(msg, type = 'info') {
    if (type === 'success') toastr.success(msg, 'DB Memory');
    else if (type === 'error') toastr.error(msg, 'DB Memory');
    else toastr.info(msg, 'DB Memory');
    
    const el = $('#db_memory_connection_message');
    if (el.length) {
        el.text(msg).css('color', type === 'error' ? '#f44336' : type === 'success' ? '#4caf50' : '#2196f3').show();
        setTimeout(() => el.fadeOut(), 3000);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Memory List
async function loadMemories(filters = {}) {
    if (!state.connected) {
        $('#db_memory_list').html('<div class="empty-state" style="padding:10px;opacity:0.6;">Not connected to backend</div>');
        return;
    }

    try {
        const data = await MemoriesAPI.list({
            ...filters,
            offset: (state.currentPage - 1) * state.pageSize,
            limit: state.pageSize
        });
        renderMemoryList(data.memories || []);
        updatePagination();
    } catch (e) {
        $('#db_memory_list').html(`<div class="error-state" style="padding:10px;color:#f44336;">Failed to load: ${escapeHtml(e.message)}</div>`);
    }
}

function renderMemoryList(memories) {
    const container = $('#db_memory_list');
    if (!container.length) return;

    if (memories.length === 0) {
        container.html('<div class="empty-state" style="padding:10px;opacity:0.6;">No memories found</div>');
        return;
    }

    const html = memories.map(m => {
        const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-';
        return `
            <div class="memory-item" style="padding:8px;margin-bottom:5px;border:1px solid var(--SmartThemeBorderColor);border-radius:5px;background:var(--SmartThemeInputBackground);">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                    <span style="font-size:0.8em;padding:2px 6px;border-radius:10px;background:var(--SmartThemeAccent);color:var(--SmartThemeButtonText);">${m.type || 'memory'}</span>
                    <span style="font-size:0.8em;opacity:0.7;">${m.importance || '-'}</span>
                </div>
                <div style="margin-bottom:5px;line-height:1.4;">${escapeHtml(m.content || '')}</div>
                <div style="display:flex;justify-content:space-between;font-size:0.8em;opacity:0.6;">
                    <span>${dateStr}</span>
                    <input type="button" class="menu_button delete-memory-btn" data-id="${m.id}" value="Delete" style="padding:2px 8px;font-size:0.9em;">
                </div>
            </div>
        `;
    }).join('');

    container.html(html);
}

function updatePagination() {
    $('#db_memory_page_info').text(`Page ${state.currentPage}`);
}

// Context List
async function loadContext() {
    if (!state.connected) {
        $('#db_memory_context_list').html('<div class="empty-state" style="padding:10px;opacity:0.6;">Not connected to backend</div>');
        return;
    }

    const context = getContext();
    const chatId = context.chatId;
    const characterId = context.characterId;

    if (!chatId) {
        $('#db_memory_context_list').html('<div class="empty-state" style="padding:10px;opacity:0.6;">No active chat selected</div>');
        return;
    }

    const chat = context.chat;
    if (!chat || !chat.length) {
        $('#db_memory_context_list').html('<div class="empty-state" style="padding:10px;opacity:0.6;">No messages yet</div>');
        return;
    }

    const lastMsg = chat[chat.length - 1];
    const query = lastMsg.mes || lastMsg.message || '';

    try {
        const data = await ContextAPI.build(query, {
            chatId,
            characterId,
            memoryLimit: state.settings.memoriesPerContext,
            similarityThreshold: state.settings.similarityThreshold
        });
        renderContextList(data.entries || []);
    } catch (e) {
        $('#db_memory_context_list').html(`<div class="error-state" style="padding:10px;color:#f44336;">Failed: ${escapeHtml(e.message)}</div>`);
    }
}

function renderContextList(entries) {
    const container = $('#db_memory_context_list');
    if (!container.length) return;

    if (!entries || entries.length === 0) {
        container.html('<div class="empty-state" style="padding:10px;opacity:0.6;">No relevant memories found</div>');
        return;
    }

    const html = entries.map(e => `
        <div class="context-item" style="padding:8px;margin-bottom:5px;border:1px solid var(--SmartThemeBorderColor);border-radius:5px;background:var(--SmartThemeInputBackground);">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                <span style="font-size:0.8em;padding:2px 6px;border-radius:10px;background:var(--SmartThemeAccent);color:var(--SmartThemeButtonText);">${e.type || 'memory'}</span>
                ${state.settings.showRelevanceScores ? `<span style="font-size:0.8em;opacity:0.7;">${(e.score * 100).toFixed(1)}%</span>` : ''}
            </div>
            <div style="margin-bottom:5px;line-height:1.4;">${escapeHtml(e.content || '')}</div>
        </div>
    `).join('');

    container.html(html);
}

// Event Handlers
function bindEventHandlers() {
    // Connection
    $('#db_memory_connect_btn').on('click', async function () {
        const url = $('#db_memory_backend_url').val().trim();
        const user = $('#db_memory_username').val().trim();
        const pass = $('#db_memory_password').val();

        if (!url || !user || !pass) {
            showMessage('Please fill all fields', 'error');
            return;
        }

        state.backendUrl = url;
        state.username = user;
        state.password = pass;
        showMessage('Connecting...', 'info');

        try {
            await login();
            showMessage('Connected!', 'success');
        } catch (e) {
            showMessage(e.message, 'error');
        }
    });

    $('#db_memory_disconnect_btn').on('click', function () {
        logout();
        $('#db_memory_password').val('');
        showMessage('Disconnected', 'info');
    });

    // Memory
    $('#db_memory_refresh_btn').on('click', function () {
        state.currentPage = 1;
        loadMemories();
    });

    $('#db_memory_search_btn').on('click', function () {
        state.currentPage = 1;
        const q = $('#db_memory_search_input').val().trim();
        loadMemories(q ? { search: q } : {});
    });

    $('#db_memory_prev_page').on('click', function () {
        if (state.currentPage > 1) {
            state.currentPage--;
            loadMemories();
        }
    });

    $('#db_memory_next_page').on('click', function () {
        state.currentPage++;
        loadMemories();
    });

    $(document).on('click', '.delete-memory-btn', async function () {
        const id = $(this).data('id');
        if (!confirm('Delete this memory?')) return;
        try {
            await MemoriesAPI.delete(id);
            loadMemories();
        } catch (e) {
            showMessage(`Failed to delete: ${e.message}`, 'error');
        }
    });

    // Context
    $('#db_memory_refresh_context_btn').on('click', function () {
        loadContext();
    });

    // Settings
    $('#db_memory_similarity_threshold').on('input', function () {
        const val = parseFloat($(this).val());
        $('#db_memory_threshold_value').text(val.toFixed(2));
    });

    $('#db_memory_save_settings_btn').on('click', function () {
        state.settings.autoSync = $('#db_memory_auto_sync').prop('checked');
        state.settings.enableAutoExtraction = $('#db_memory_auto_extraction').prop('checked');
        state.settings.messagesPerSync = parseInt($('#db_memory_messages_per_sync').val()) || 10;
        state.settings.memoriesPerContext = parseInt($('#db_memory_memories_per_context').val()) || 5;
        state.settings.similarityThreshold = parseFloat($('#db_memory_similarity_threshold').val()) || 0.7;
        state.settings.showRelevanceScores = $('#db_memory_show_scores').prop('checked');
        state.settings.debugMode = $('#db_memory_debug_mode').prop('checked');
        saveState();
        showMessage('Settings saved', 'success');
    });

    $('#db_memory_reset_settings_btn').on('click', function () {
        if (!confirm('Reset to defaults?')) return;
        state.settings = {
            autoSync: true,
            enableAutoExtraction: true,
            messagesPerSync: 10,
            memoriesPerContext: 5,
            similarityThreshold: 0.7,
            showRelevanceScores: true,
            debugMode: false
        };
        populateSettings();
        saveState();
        showMessage('Settings reset', 'info');
    });
}

function populateSettings() {
    $('#db_memory_backend_url').val(state.backendUrl);
    $('#db_memory_username').val(state.username);
    $('#db_memory_password').val(state.password);
    $('#db_memory_auto_sync').prop('checked', state.settings.autoSync);
    $('#db_memory_auto_extraction').prop('checked', state.settings.enableAutoExtraction);
    $('#db_memory_messages_per_sync').val(state.settings.messagesPerSync);
    $('#db_memory_memories_per_context').val(state.settings.memoriesPerContext);
    $('#db_memory_similarity_threshold').val(state.settings.similarityThreshold);
    $('#db_memory_threshold_value').text(state.settings.similarityThreshold.toFixed(2));
    $('#db_memory_show_scores').prop('checked', state.settings.showRelevanceScores);
    $('#db_memory_debug_mode').prop('checked', state.settings.debugMode);
}

// Init
async function init() {
    console.log('[DB Memory] Initializing...');
    
    loadState();
    
    // Load template into SillyTavern's extension settings container
    console.log('[DB Memory] Loading template...');
    const html = await renderExtensionTemplateAsync(TEMPLATE_PATH, 'drawer');
    console.log('[DB Memory] Template loaded, length:', html.length);
    
    // Check if container exists
    const container = $('#extensions_settings2');
    console.log('[DB Memory] Container found:', container.length > 0);
    
    if (container.length > 0) {
        container.append(html);
        console.log('[DB Memory] HTML appended');
    } else {
        console.error('[DB Memory] Container not found!');
        return;
    }
    
    // Populate settings
    console.log('[DB Memory] Populating settings...');
    populateSettings();
    
    // Bind events
    console.log('[DB Memory] Binding events...');
    bindEventHandlers();
    
    // Auto-connect if we have credentials
    if (state.backendUrl && state.username && state.password) {
        console.log('[DB Memory] Auto-connecting...');
        try {
            if (state.jwtToken && !isTokenExpired()) {
                await login();
            } else if (state.jwtToken && isTokenExpired()) {
                await reLogin();
            }
        } catch (e) {
            console.warn('[DB Memory] Auto-connect failed:', e.message);
        }
    }
    
    updateConnectionStatus();
    console.log('[DB Memory] Initialization complete');
}

jQuery(() => {
    init();
});
