/**
 * DB Memory Extension - Minimal version for phone
 * Mobile-friendly with eventSource auto-sync
 */

const EXTENSION_NAME = 'db_memory_minimal';

// Simple state
const state = {
    backendUrl: '',
    username: '',
    password: '',
    connected: false,
    jwtToken: null,
    tokenExpiry: null,
    settings: {
        autoSync: true,
        enableAutoExtraction: true,
        debugMode: false
    }
};

// Load settings
if (!extension_settings[EXTENSION_NAME]) {
    extension_settings[EXTENSION_NAME] = {};
}

function loadSettings() {
    const saved = extension_settings[EXTENSION_NAME];
    state.backendUrl = saved.backendUrl || '';
    state.username = saved.username || '';
    state.jwtToken = saved.jwtToken || null;
    state.tokenExpiry = saved.tokenExpiry || null;
    if (saved.settings) {
        state.settings = { ...state.settings, ...saved.settings };
    }
}

function saveSettings() {
    extension_settings[EXTENSION_NAME].backendUrl = state.backendUrl;
    extension_settings[EXTENSION_NAME].username = state.username;
    extension_settings[EXTENSION_NAME].jwtToken = state.jwtToken;
    extension_settings[EXTENSION_NAME].tokenExpiry = state.tokenExpiry;
    extension_settings[EXTENSION_NAME].settings = { ...state.settings };
    saveSettingsDebounced();
}

// HTTP Client
async function apiCall(endpoint, options = {}) {
    const url = `${state.backendUrl.replace(/\/$/, '')}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(state.jwtToken ? { 'Authorization': `Bearer ${state.jwtToken}` } : {})
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    try {
        const response = await fetch(url, {
            ...options,
            headers: { ...headers, ...options.headers },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.status === 401 && state.jwtToken) {
            await reLogin();
            return apiCall(endpoint, options);
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        return response.status === 204 ? null : await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('Request timeout');
        }
        throw error;
    }
}

// Authentication
async function authenticate() {
    if (!state.username || !state.password) {
        throw new Error('No credentials provided');
    }
    
    const response = await apiCall('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
            username: state.username,
            password: state.password
        })
    });
    
    if (response && response.token) {
        state.jwtToken = response.token;
        try {
            const payload = JSON.parse(atob(response.token.split('.')[1]));
            state.tokenExpiry = new Date(payload.exp * 1000).toISOString();
        } catch (e) {
            console.warn('[DB Memory] Could not parse token expiry:', e);
        }
        state.connected = true;
        saveSettings();
        updateConnectionStatus();
        return true;
    }
    
    throw new Error('Authentication failed');
}

async function reLogin() {
    if (!state.username || !state.password) return;
    try {
        const data = await apiCall('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username: state.username, password: state.password })
        });
        if (data?.token) {
            state.jwtToken = data.token;
            try {
                const payload = JSON.parse(atob(data.token.split('.')[1]));
                state.tokenExpiry = new Date(payload.exp * 1000).toISOString();
            } catch { }
            saveSettings();
        }
    } catch (e) {
        console.error('[DB Memory] Re-login failed:', e);
        state.connected = false;
        updateConnectionStatus();
        throw e;
    }
}

// Process a message through memory engine
async function processMessage(message, role = 'user') {
    if (!state.connected) {
        throw new Error('Not connected to backend');
    }
    
    const context = getContext();
    const chatId = context.chatId;
    const characterId = context.characterId;
    
    const response = await apiCall('/api/memories/process', {
        method: 'POST',
        body: JSON.stringify({
            content: message,
            role: role,
            chatId: chatId || null,
            characterId: characterId || null,
            sourceMessageId: null
        })
    });
    
    return response;
}

// Update connection status display
function updateConnectionStatus() {
    const statusEl = $('#db_memory_status');
    if (!statusEl.length) return;
    
    if (state.connected) {
        statusEl.text('Connected').css({ background: '#d4edda', color: '#155724' });
    } else {
        statusEl.text('Disconnected').css({ background: '#f8d7da', color: '#721c24' });
    }
}

// Show status message
function showStatus(message, type = 'info') {
    toastr[type === 'success' ? 'success' : type === 'error' ? 'error' : 'info'](message, 'DB Memory');
}

// Create minimal UI
function createMinimalUI() {
    return `
        <div style="padding: 15px;">
            <h3 style="margin-top: 0;">DB Memory</h3>
            
            <div style="margin-bottom: 15px;">
                <label style="display:block;margin-bottom:3px;">Backend URL:</label>
                <input type="text" id="db_url" value="${state.backendUrl}" style="width:100%;padding:8px;margin-bottom:8px;" placeholder="http://192.168.1.70:3000">
                
                <label style="display:block;margin-bottom:3px;">Username:</label>
                <input type="text" id="db_user" value="${state.username}" style="width:100%;padding:8px;margin-bottom:8px;" placeholder="Username">
                
                <label style="display:block;margin-bottom:3px;">Password:</label>
                <input type="password" id="db_pass" style="width:100%;padding:8px;margin-bottom:8px;" placeholder="Password">
                
                <button onclick="connectDB()" style="padding:8px15px;margin-right:10px;background:#007bff;color:white;border:none;border-radius:4px;">Connect</button>
                <button onclick="disconnectDB()" style="padding:8px15px;background:#dc3545;color:white;border:none;border-radius:4px;">Disconnect</button>
            </div>
            
            <div id="db_memory_status" style="padding:8px;margin-bottom:10px;border-radius:4px;font-weight:bold;">Disconnected</div>
            
            <label style="display:flex;align-items:center;margin-bottom:10px;">
                <input type="checkbox" id="db_auto_sync" ${state.settings.autoSync ? 'checked' : ''} style="margin-right:8px;"> 
                Auto-sync messages
            </label>
            
            <label style="display:flex;align-items:center;">
                <input type="checkbox" id="db_auto_extract" ${state.settings.enableAutoExtraction ? 'checked' : ''} style="margin-right:8px;"> 
                Auto-extract memories
            </label>
        </div>
    `;
}

// Connect function
window.connectDB = async function() {
    const url = document.getElementById('db_url').value.trim();
    const user = document.getElementById('db_user').value.trim();
    const pass = document.getElementById('db_pass').value;
    
    if (!url || !user || !pass) {
        showStatus('Fill all fields', 'error');
        return;
    }
    
    state.backendUrl = url;
    state.username = user;
    state.password = pass;
    
    showStatus('Connecting...', 'info');
    
    try {
        await authenticate();
        showStatus('Connected!', 'success');
    } catch (e) {
        state.connected = false;
        updateConnectionStatus();
        showStatus('Connection failed: ' + e.message, 'error');
    }
};

// Disconnect function
window.disconnectDB = function() {
    state.connected = false;
    state.jwtToken = null;
    state.tokenExpiry = null;
    state.password = '';
    saveSettings();
    updateConnectionStatus();
    showStatus('Disconnected', 'info');
};

// Hook into SillyTavern message flow with eventSource
function hookIntoMessageFlow() {
    if (window.eventSource && window.event_types) {
        const NEW_MESSAGE = window.event_types.NEW_MESSAGE;
        const CHAT_CHANGED = window.event_types.CHAT_CHANGED;
        
        window.eventSource.addEventListener(NEW_MESSAGE, async (msg) => {
            if (!state.connected || !state.settings.autoSync) return;
            
            try {
                const content = msg.message?.mes || msg.message || msg.mes || '';
                if (!content) return;
                
                const messageId = msg.message?.id || msg.id;
                
                // Skip duplicates
                if (window._lastDbMemoryMsgId === messageId) return;
                window._lastDbMemoryMsgId = messageId;
                
                const role = (msg.author === 'user' || msg.is_user) ? 'user' : 'assistant';
                
                // Save to backend
                await processMessage(content, role);
                
                if (state.settings.debugMode) {
                    console.log('[DB Memory] Saved:', content.substring(0, 30));
                }
            } catch (error) {
                if (state.settings.debugMode) {
                    console.error('[DB Memory] Error:', error);
                }
            }
        });
        
        window.eventSource.addEventListener(CHAT_CHANGED, () => {
            window._lastDbMemoryMsgId = null;
        });
    }
}

// Bind setting changes
function bindSettings() {
    $('#db_auto_sync').on('change', function() {
        state.settings.autoSync = $(this).prop('checked');
        saveSettings();
    });
    
    $('#db_auto_extract').on('change', function() {
        state.settings.enableAutoExtraction = $(this).prop('checked');
        saveSettings();
    });
}

// Initialize
jQuery(() => {
    console.log('[DB Memory Minimal] Initializing...');
    
    loadSettings();
    
    const container = $('#extensions_settings2');
    if (container.length > 0) {
        container.append(createMinimalUI());
    }
    
    bindSettings();
    
    // Auto-connect if we have credentials
    if (state.backendUrl && state.username && state.password) {
        if (state.jwtToken && !isTokenExpired()) {
            setTimeout(() => {
                apiCall('/health').then(() => {
                    state.connected = true;
                    updateConnectionStatus();
                }).catch(e => {
                    console.warn('[DB Memory] Auto-connect failed:', e);
                });
            }, 500);
        }
    }
    
    // Hook into message flow
    hookIntoMessageFlow();
    
    console.log('[DB Memory Minimal] Initialized');
});

function isTokenExpired() {
    if (!state.tokenExpiry) return false;
    return new Date() >= new Date(state.tokenExpiry);
}
