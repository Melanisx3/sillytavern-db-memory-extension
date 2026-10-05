/**
 * DB Memory Extension - Simplified version for mobile compatibility
 * Based on typical SillyTavern extension structure
 */

const EXTENSION_NAME = 'db_memory';
const EXTENSION_FOLDER = 'third-party/sillytavern-db-memory-extension';

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
    processedMessages: new Set()
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

// UI Functions
function updateConnectionStatus() {
    const statusEl = $(`#${EXTENSION_NAME}_status`);
    if (!statusEl.length) return;

    if (state.connected && state.jwtToken) {
        statusEl.removeClass('status-error').addClass('status-ok')
            .html('<i class="fa-solid fa-circle-check"></i> Connected').show();
    } else {
        statusEl.removeClass('status-ok').addClass('status-error')
            .html('<i class="fa-solid fa-circle-xmark"></i> Disconnected').show();
    }
}

function showMessage(msg, type = 'info') {
    if (type === 'success') toastr.success(msg, 'DB Memory');
    else if (type === 'error') toastr.error(msg, 'DB Memory');
    else toastr.info(msg, 'DB Memory');
}

// Create extension UI
function createExtensionUI() {
    const uiHTML = `
        <div class="db_memory_extension">
            <div class="db_memory_header">
                <div class="db_memory_title">
                    <i class="fa-solid fa-brain"></i>
                    <span>DB Memory</span>
                </div>
                <div class="db_memory_status" id="${EXTENSION_NAME}_status">
                    <i class="fa-solid fa-circle-xmark"></i> Disconnected
                </div>
            </div>
            
            <div class="db_memory_content">
                <div class="db_memory_section">
                    <h4><i class="fa-solid fa-plug"></i> Connection</h4>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_backend_url">Backend URL:</label>
                        <input type="text" id="${EXTENSION_NAME}_backend_url" class="text_pole" placeholder="http://192.168.1.70:3000" value="${state.backendUrl}">
                    </div>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_username">Username:</label>
                        <input type="text" id="${EXTENSION_NAME}_username" class="text_pole" placeholder="Username" value="${state.username}">
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
                        <button id="${EXTENSION_NAME}_test_btn" class="menu_button">
                            <i class="fa-solid fa-heartbeat"></i> Test
                        </button>
                    </div>
                </div>

                <div class="db_memory_section">
                    <h4><i class="fa-solid fa-cog"></i> Settings</h4>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_auto_sync" ${state.settings.autoSync ? 'checked' : ''}>
                            <span>Auto-sync messages</span>
                        </label>
                    </div>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_auto_extraction" ${state.settings.enableAutoExtraction ? 'checked' : ''}>
                            <span>Auto-extract memories</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_memories_per_context">Memories per context:</label>
                        <input type="number" id="${EXTENSION_NAME}_memories_per_context" class="text_pole" min="1" max="50" value="${state.settings.memoriesPerContext}">
                    </div>
                    <div class="form-group">
                        <label for="${EXTENSION_NAME}_similarity_threshold">
                            Similarity threshold: <span id="${EXTENSION_NAME}_threshold_value">${state.settings.similarityThreshold}</span>
                        </label>
                        <input type="range" id="${EXTENSION_NAME}_similarity_threshold" min="0" max="1" step="0.1" value="${state.settings.similarityThreshold}">
                    </div>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_show_scores" ${state.settings.showRelevanceScores ? 'checked' : ''}>
                            <span>Show relevance scores</span>
                        </label>
                    </div>
                    <div class="checkbox-group">
                        <label>
                            <input type="checkbox" id="${EXTENSION_NAME}_debug_mode" ${state.settings.debugMode ? 'checked' : ''}>
                            <span>Debug mode</span>
                        </label>
                    </div>
                    <div class="button-group">
                        <button id="${EXTENSION_NAME}_save_btn" class="menu_button">
                            <i class="fa-solid fa-save"></i> Save Settings
                        </button>
                        <button id="${EXTENSION_NAME}_reset_btn" class="menu_button">
                            <i class="fa-solid fa-undo"></i> Reset
                        </button>
                    </div>
                </div>

                <div class="db_memory_section">
                    <h4><i class="fa-solid fa-info-circle"></i> Status</h4>
                    <div id="${EXTENSION_NAME}_status_msg" class="status-message"></div>
                    <div class="memory-info">
                        <p><strong>Last sync:</strong> <span id="${EXTENSION_NAME}_last_sync">Never</span></p>
                        <p><strong>Processed messages:</strong> <span id="${EXTENSION_NAME}_processed_count">0</span></p>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append to extensions container
    const container = $('#extensions_settings2');
    if (container.length > 0) {
        container.append(uiHTML);
    } else {
        // Fallback for mobile
        $('body').append(`<div id="${EXTENSION_NAME}_mobile_container">${uiHTML}</div>`);
    }
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

    $(`#${EXTENSION_NAME}_disconnect_btn`).on('click', function () {
        logout();
        $(`#${EXTENSION_NAME}_password`).val('');
        showMessage('Disconnected', 'info');
    });

    $(`#${EXTENSION_NAME}_test_btn`).on('click', async function () {
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

    // Settings
    $(`#${EXTENSION_NAME}_similarity_threshold`).on('input', function () {
        const val = parseFloat($(this).val());
        $(`#${EXTENSION_NAME}_threshold_value`).text(val.toFixed(1));
    });

    $(`#${EXTENSION_NAME}_save_btn`).on('click', function () {
        state.settings.autoSync = $(`#${EXTENSION_NAME}_auto_sync`).prop('checked');
        state.settings.enableAutoExtraction = $(`#${EXTENSION_NAME}_auto_extraction`).prop('checked');
        state.settings.memoriesPerContext = parseInt($(`#${EXTENSION_NAME}_memories_per_context`).val()) || 5;
        state.settings.similarityThreshold = parseFloat($(`#${EXTENSION_NAME}_similarity_threshold`).val()) || 0.7;
        state.settings.showRelevanceScores = $(`#${EXTENSION_NAME}_show_scores`).prop('checked');
        state.settings.debugMode = $(`#${EXTENSION_NAME}_debug_mode`).prop('checked');
        saveState();
        showMessage('Settings saved', 'success');
    });

    $(`#${EXTENSION_NAME}_reset_btn`).on('click', function () {
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
    $(`#${EXTENSION_NAME}_auto_sync`).prop('checked', state.settings.autoSync);
    $(`#${EXTENSION_NAME}_auto_extraction`).prop('checked', state.settings.enableAutoExtraction);
    $(`#${EXTENSION_NAME}_memories_per_context`).val(state.settings.memoriesPerContext);
    $(`#${EXTENSION_NAME}_similarity_threshold`).val(state.settings.similarityThreshold);
    $(`#${EXTENSION_NAME}_threshold_value`).text(state.settings.similarityThreshold.toFixed(1));
    $(`#${EXTENSION_NAME}_show_scores`).prop('checked', state.settings.showRelevanceScores);
    $(`#${EXTENSION_NAME}_debug_mode`).prop('checked', state.settings.debugMode);
}

// Initialize extension
async function init() {
    console.log('[DB Memory] Initializing simplified extension...');
    
    loadState();
    
    // Create UI
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
    if (eventSource && event_types) {
        eventSource.addEventListener(event_types.NEW_MESSAGE, async (msg) => {
            if (state.settings.autoSync && state.connected) {
                try {
                    const context = getContext();
                    const messageId = msg.message?.id || msg.id;
                    if (!state.processedMessages.has(messageId)) {
                        state.processedMessages.add(messageId);
                        state.lastSyncedMessageId = messageId;
                        
                        // Update UI
                        $(`#${EXTENSION_NAME}_last_sync`).text('Just now');
                        $(`#${EXTENSION_NAME}_processed_count`).text(state.processedMessages.size);
                        
                        // Process message (simplified)
                        await request('/api/memories/process', {
                            method: 'POST',
                            body: JSON.stringify({
                                content: msg.message?.mes || msg.message || '',
                                role: msg.author === 'user' ? 'user' : 'assistant',
                                chatId: context.chatId,
                                characterId: context.characterId
                            })
                        });
                    }
                } catch (e) {
                    if (state.settings.debugMode) console.error('[DB Memory] Auto-sync failed:', e);
                }
            }
        });
    }
    
    console.log('[DB Memory] Simplified extension initialized');
}

// SillyTavern lifecycle hooks
function onInstall() {
    console.log('[DB Memory] Extension installed');
}

function onEnable() {
    console.log('[DB Memory] Extension enabled');
    init();
}

function onDisable() {
    console.log('[DB Memory] Extension disabled');
    logout();
}

function onActivate() {
    console.log('[DB Memory] Extension activated');
    // Ensure UI is visible
    $(`.db_memory_extension`).show();
}

// Start initialization
jQuery(() => {
    // Register lifecycle hooks
    if (typeof window !== 'undefined' && window.SillyTavern && window.SillyTavern.registerExtension) {
        window.SillyTavern.registerExtension(EXTENSION_NAME, {
            onInstall,
            onEnable,
            onDisable,
            onActivate
        });
    }
});