/**
 * DB Memory Extension - Native SillyTavern Integration
 * Fully integrated extension with proper UI/UX for both desktop and mobile
 */

const EXTENSION_NAME = 'db_memory';
const EXTENSION_FOLDER = 'third-party/sillytavern-db-memory-extension';

// State management
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
        debugMode: false,
        enableRealTimeSync: true,
        syncInterval: 5000
    },
    lastSyncedMessageId: null,
    processedMessages: new Set(),
    currentPage: 1,
    pageSize: 20,
    isExpanded: false
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

// Authentication
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

// API Functions
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
    const statusEl = $(`#${EXTENSION_NAME}_status`);
    if (!statusEl.length) return;

    if (state.connected && state.jwtToken) {
        statusEl.removeClass('status-error status-info').addClass('status-ok')
            .html('<i class="fa-solid fa-circle-check"></i> Connected').show();
    } else {
        statusEl.removeClass('status-ok status-info').addClass('status-error')
            .html('<i class="fa-solid fa-circle-xmark"></i> Disconnected').show();
    }
}

function showMessage(msg, type = 'info') {
    if (type === 'success') toastr.success(msg, 'DB Memory');
    else if (type === 'error') toastr.error(msg, 'DB Memory');
    else toastr.info(msg, 'DB Memory');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Memory List
async function loadMemories(filters = {}) {
    if (!state.connected) {
        $(`#${EXTENSION_NAME}_list`).html('<div class="empty-state" style="padding:10px;opacity:0.6;">Not connected to backend</div>');
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
        $(`#${EXTENSION_NAME}_list`).html(`<div class="error-state" style="padding:10px;color:#f44336;">Failed to load: ${escapeHtml(e.message)}</div>`);
    }
}

function renderMemoryList(memories) {
    const container = $(`#${EXTENSION_NAME}_list`);
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
                    <button class="menu_button delete-memory-btn" data-id="${m.id}" style="padding:2px 8px;font-size:0.9em;">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    container.html(html);
}

function updatePagination() {
    $(`#${EXTENSION_NAME}_page_info`).text(`Page ${state.currentPage}`);
}

// Context List
async function loadContext() {
    if (!state.connected) {
        $(`#${EXTENSION_NAME}_context_list`).html('<div class="empty-state" style="padding:10px;opacity:0.6;">Not connected to backend</div>');
        return;
    }

    const context = getContext();
    const chatId = context.chatId;
    const characterId = context.characterId;

    if (!chatId) {
        $(`#${EXTENSION_NAME}_context_list`).html('<div class="empty-state" style="padding:10px;opacity:0.6;">No active chat selected</div>');
        return;
    }

    const chat = context.chat;
    if (!chat || !chat.length) {
        $(`#${EXTENSION_NAME}_context_list`).html('<div class="empty-state" style="padding:10px;opacity:0.6;">No messages yet</div>');
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
        $(`#${EXTENSION_NAME}_context_list`).html(`<div class="error-state" style="padding:10px;color:#f44336;">Failed: ${escapeHtml(e.message)}</div>`);
    }
}

function renderContextList(entries) {
    const container = $(`#${EXTENSION_NAME}_context_list`);
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
    $(`#${EXTENSION_NAME}_connect_btn`).on('click', async function () {
        const url = $(`#${EXTENSION_NAME}_backend_url`).val().trim();
        const user = $(`#${EXTENSION_NAME}_username`).val().trim();
        const pass = $(`#${EXTENSION_NAME}_password`).val();

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

    $(`#${EXTENSION_NAME}_test_connection_btn`).on('click', async function () {
        if (!state.connected) {
            showMessage('Not connected. Please connect first.', 'error');
            return;
        }

        showMessage('Testing connection...', 'info');

        try {
            await testConnection();
            showMessage('Connection is healthy!', 'success');
        } catch (e) {
            showMessage(`Test failed: ${e.message}`, 'error');
        }
    });

    $(`#${EXTENSION_NAME}_disconnect_btn`).on('click', function () {
        logout();
        $(`#${EXTENSION_NAME}_password`).val('');
        showMessage('Disconnected', 'info');
    });

    // Memory
    $(`#${EXTENSION_NAME}_refresh_btn`).on('click', function () {
        state.currentPage = 1;
        loadMemories();
    });

    $(`#${EXTENSION_NAME}_search_btn`).on('click', function () {
        state.currentPage = 1;
        const q = $(`#${EXTENSION_NAME}_search_input`).val().trim();
        loadMemories(q ? { search: q } : {});
    });

    $(`#${EXTENSION_NAME}_prev_page`).on('click', function () {
        if (state.currentPage > 1) {
            state.currentPage--;
            loadMemories();
        }
    });

    $(`#${EXTENSION_NAME}_next_page`).on('click', function () {
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
    $(`#${EXTENSION_NAME}_refresh_context_btn`).on('click', function () {
        loadContext();
    });

    // Settings
    $(`#${EXTENSION_NAME}_similarity_threshold`).on('input', function () {
        const val = parseFloat($(this).val());
        $(`#${EXTENSION_NAME}_threshold_value`).text(val.toFixed(2));
    });

    $(`#${EXTENSION_NAME}_save_settings_btn`).on('click', function () {
        state.settings.autoSync = $(`#${EXTENSION_NAME}_auto_sync`).prop('checked');
        state.settings.enableAutoExtraction = $(`#${EXTENSION_NAME}_auto_extraction`).prop('checked');
        state.settings.messagesPerSync = parseInt($(`#${EXTENSION_NAME}_messages_per_sync`).val()) || 10;
        state.settings.memoriesPerContext = parseInt($(`#${EXTENSION_NAME}_memories_per_context`).val()) || 5;
        state.settings.similarityThreshold = parseFloat($(`#${EXTENSION_NAME}_similarity_threshold`).val()) || 0.7;
        state.settings.showRelevanceScores = $(`#${EXTENSION_NAME}_show_scores`).prop('checked');
        state.settings.debugMode = $(`#${EXTENSION_NAME}_debug_mode`).prop('checked');
        state.settings.enableRealTimeSync = $(`#${EXTENSION_NAME}_real_time_sync`).prop('checked');
        saveState();
        showMessage('Settings saved', 'success');
    });

    $(`#${EXTENSION_NAME}_reset_settings_btn`).on('click', function () {
        if (!confirm('Reset to defaults?')) return;
        state.settings = {
            autoSync: true,
            enableAutoExtraction: true,
            messagesPerSync: 10,
            memoriesPerContext: 5,
            similarityThreshold: 0.7,
            showRelevanceScores: true,
            debugMode: false,
            enableRealTimeSync: true,
            syncInterval: 5000
        };
        populateSettings();
        saveState();
        showMessage('Settings reset', 'info');
    });

    // Toggle expansion
    $(`#${EXTENSION_NAME}_toggle_btn`).on('click', function () {
        state.isExpanded = !state.isExpanded;
        const content = $(`#${EXTENSION_NAME}_content`);
        const toggleBtn = $(`#${EXTENSION_NAME}_toggle_btn`);
        
        if (state.isExpanded) {
            content.slideDown(200);
            toggleBtn.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        } else {
            content.slideUp(200);
            toggleBtn.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        }
    });
}

function populateSettings() {
    $(`#${EXTENSION_NAME}_backend_url`).val(state.backendUrl);
    $(`#${EXTENSION_NAME}_username`).val(state.username);
    $(`#${EXTENSION_NAME}_password`).val(state.password);
    $(`#${EXTENSION_NAME}_auto_sync`).prop('checked', state.settings.autoSync);
    $(`#${EXTENSION_NAME}_auto_extraction`).prop('checked', state.settings.enableAutoExtraction);
    $(`#${EXTENSION_NAME}_messages_per_sync`).val(state.settings.messagesPerSync);
    $(`#${EXTENSION_NAME}_memories_per_context`).val(state.settings.memoriesPerContext);
    $(`#${EXTENSION_NAME}_similarity_threshold`).val(state.settings.similarityThreshold);
    $(`#${EXTENSION_NAME}_threshold_value`).text(state.settings.similarityThreshold.toFixed(2));
    $(`#${EXTENSION_NAME}_show_scores`).prop('checked', state.settings.showRelevanceScores);
    $(`#${EXTENSION_NAME}_debug_mode`).prop('checked', state.settings.debugMode);
    $(`#${EXTENSION_NAME}_real_time_sync`).prop('checked', state.settings.enableRealTimeSync);
}

// Create native extension UI
function createExtensionUI() {
    const uiHTML = `
        <div class="extension-container">
            <div class="extension-header">
                <div class="extension-title">
                    <i class="fa-solid fa-brain"></i>
                    <span>DB Memory</span>
                </div>
                <div class="extension-status">
                    <span id="${EXTENSION_NAME}_status" class="status-block status-error">
                        <i class="fa-solid fa-circle-xmark"></i> Disconnected
                    </span>
                </div>
                <div class="extension-toggle">
                    <i class="fa-solid fa-chevron-down" id="${EXTENSION_NAME}_toggle_btn"></i>
                </div>
            </div>
            
            <div class="extension-content" id="${EXTENSION_NAME}_content" style="display: none;">
                <!-- Connection Section -->
                <div class="extension-section">
                    <h4><i class="fa-solid fa-plug"></i> Connection</h4>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_backend_url">Backend URL:</label>
                        <input type="text" id="${EXTENSION_NAME}_backend_url" class="text_pole" placeholder="http://192.168.1.70:3000">
                    </div>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_username">Username:</label>
                        <input type="text" id="${EXTENSION_NAME}_username" class="text_pole" placeholder="Username">
                    </div>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_password">Password:</label>
                        <input type="password" id="${EXTENSION_NAME}_password" class="text_pole" placeholder="Password">
                    </div>
                    <div class="button-group">
                        <button id="${EXTENSION_NAME}_connect_btn" class="menu_button">
                            <i class="fa-solid fa-plug"></i> Connect
                        </button>
                        <button id="${EXTENSION_NAME}_disconnect_btn" class="menu_button">
                            <i class="fa-solid fa-plug-circle-xmark"></i> Disconnect
                        </button>
                        <button id="${EXTENSION_NAME}_test_connection_btn" class="menu_button">
                            <i class="fa-solid fa-heartbeat"></i> Test Connection
                        </button>
                    </div>
                </div>

                <!-- Auto-Sync Section -->
                <div class="extension-section">
                    <h4><i class="fa-solid fa-sync"></i> Auto-Sync</h4>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_auto_sync">
                            <span>Auto-sync messages to database</span>
                        </label>
                    </div>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_auto_extraction">
                            <span>Auto-extract memories from messages</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_messages_per_sync">Messages per sync:</label>
                        <input type="number" id="${EXTENSION_NAME}_messages_per_sync" class="text_pole" min="1" max="100" value="10">
                    </div>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_real_time_sync">
                            <span>Real-time sync</span>
                        </label>
                    </div>
                </div>

                <!-- Context Section -->
                <div class="extension-section">
                    <h4><i class="fa-solid fa-brain"></i> Context Injection</h4>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_memories_per_context">Memories per context:</label>
                        <input type="number" id="${EXTENSION_NAME}_memories_per_context" class="text_pole" min="1" max="50" value="5">
                    </div>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_similarity_threshold">
                            Similarity threshold: <span id="${EXTENSION_NAME}_threshold_value">0.70</span>
                        </label>
                        <input type="range" id="${EXTENSION_NAME}_similarity_threshold" class="wide100p" min="0" max="1" step="0.01">
                    </div>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_show_scores">
                            <span>Show relevance scores</span>
                        </label>
                    </div>
                </div>

                <!-- Memory Browser Section -->
                <div class="extension-section">
                    <h4><i class="fa-solid fa-list"></i> Memory Browser</h4>
                    <div class="form-group">
                        <input type="text" id="${EXTENSION_NAME}_search_input" class="text_pole flex1" placeholder="Search memories...">
                        <button id="${EXTENSION_NAME}_search_btn" class="menu_button">Search</button>
                        <button id="${EXTENSION_NAME}_refresh_btn" class="menu_button">Refresh</button>
                    </div>
                    <div id="${EXTENSION_NAME}_list" class="memory-list"></div>
                    <div class="pagination">
                        <button id="${EXTENSION_NAME}_prev_page" class="menu_button">← Prev</button>
                        <span id="${EXTENSION_NAME}_page_info">Page 1</span>
                        <button id="${EXTENSION_NAME}_next_page" class="menu_button">Next →</button>
                    </div>
                </div>

                <!-- Context Preview Section -->
                <div class="extension-section">
                    <h4><i class="fa-solid fa-eye"></i> Context Preview</h4>
                    <div class="form-group">
                        <button id="${EXTENSION_NAME}_refresh_context_btn" class="menu_button">Refresh Context</button>
                    </div>
                    <div id="${EXTENSION_NAME}_context_list" class="memory-list"></div>
                </div>

                <!-- Debug Section -->
                <div class="extension-section">
                    <h4><i class="fa-solid fa-bug"></i> Debug</h4>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_debug_mode">
                            <span>Debug mode (console logging)</span>
                        </label>
                    </div>
                    <div class="button-group">
                        <button id="${EXTENSION_NAME}_save_settings_btn" class="menu_button">
                            <i class="fa-solid fa-save"></i> Save Settings
                        </button>
                        <button id="${EXTENSION_NAME}_reset_settings_btn" class="menu_button">
                            <i class="fa-solid fa-undo"></i> Reset Defaults
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Find the extensions container
    const container = $('#extensions_settings2');
    if (container.length > 0) {
        container.append(uiHTML);
    } else {
        // Fallback for mobile
        $('body').append(`
            <div id="${EXTENSION_NAME}_mobile_container" class="mobile-extension-container">
                ${uiHTML}
            </div>
        `);
    }
}

// Initialize extension
async function init() {
    console.log('[DB Memory] Initializing native extension...');
    
    loadState();
    
    // Create native UI
    createExtensionUI();
    
    // Populate settings
    populateSettings();
    
    // Bind events
    bindEventHandlers();
    
    // Auto-connect if we have credentials
    if (state.backendUrl && state.username && state.password) {
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
    
    // Subscribe to chat events for auto-sync
    if (eventSource) {
        eventSource.addEventListener(event_types.NEW_MESSAGE, async (msg) => {
            if (state.settings.autoSync && state.connected) {
                try {
                    const context = getContext();
                    const messageId = msg.message?.id || msg.id;
                    if (!state.processedMessages.has(messageId)) {
                        state.processedMessages.add(messageId);
                        await MemoriesAPI.process(msg.message?.mes || msg.message || '', {
                            role: msg.author === 'user' ? 'user' : 'assistant',
                            chatId: context.chatId,
                            characterId: context.characterId,
                            sourceMessageId: messageId
                        });
                    }
                } catch (e) {
                    if (state.settings.debugMode) console.error('[DB Memory] Auto-sync failed:', e);
                }
            }
        });
        
        eventSource.addEventListener(event_types.CHAT_CHANGED, () => {
            state.processedMessages.clear();
            state.lastSyncedMessageId = null;
        });
    }
    
    console.log('[DB Memory] Native extension initialized');
}

// Start initialization
jQuery(() => {
    init();
});