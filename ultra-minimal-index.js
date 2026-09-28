/**
 * DB Memory Extension - Ultra minimal version
 * Mobile-friendly: collapsible menu with expanded settings
 */

// Global state for the extension
const dbMemoryState = {
    connected: false,
    backendUrl: '',
    username: '',
    password: '',
    jwtToken: null,
    tokenExpiry: null,
    isExpanded: false,
    settings: {
        autoSync: true,
        messagesPerSync: 10,
        memoriesPerContext: 5,
        similarityThreshold: 0.7,
        enableAutoExtraction: true,
        showRelevanceScores: true,
        debugMode: false,
        maxContextLength: 2000,
        enableContextBuilding: true,
        enableMemorySearch: true,
        enableRealTimeSync: true,
        syncInterval: 5000
    },
    lastProcessedMessageId: null,
    processingQueue: [],
    isProcessing: false
};

// Load saved settings
function loadSettings() {
    const saved = localStorage.getItem('db_memory_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(dbMemoryState, parsed);
        } catch (e) {
            console.error('[DB Memory] Failed to load settings:', e);
        }
    }
}

// Save settings
function saveSettings() {
    localStorage.setItem('db_memory_settings', JSON.stringify(dbMemoryState));
}

// HTTP Client with JWT
async function apiCall(endpoint, options = {}) {
    const url = `${dbMemoryState.backendUrl}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(dbMemoryState.jwtToken ? { 'Authorization': `Bearer ${dbMemoryState.jwtToken}` } : {})
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
        
        if (response.status === 401 && dbMemoryState.jwtToken) {
            await authenticate();
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
    if (!dbMemoryState.username || !dbMemoryState.password) {
        throw new Error('No credentials provided');
    }
    
    const response = await apiCall('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
            username: dbMemoryState.username,
            password: dbMemoryState.password
        })
    });
    
    if (response && response.token) {
        dbMemoryState.jwtToken = response.token;
        try {
            const payload = JSON.parse(atob(response.token.split('.')[1]));
            dbMemoryState.tokenExpiry = new Date(payload.exp * 1000).toISOString();
        } catch (e) {
            console.warn('[DB Memory] Could not parse token expiry:', e);
        }
        dbMemoryState.connected = true;
        saveSettings();
        updateConnectionStatus();
        return true;
    }
    
    throw new Error('Authentication failed');
}

// Health check
async function testConnection() {
    try {
        const response = await apiCall('/health');
        return response && response.status === 'ok';
    } catch (error) {
        console.error('[DB Memory] Health check failed:', error);
        return false;
    }
}

// Process a message through memory engine
async function processMessage(message, role = 'user') {
    if (!dbMemoryState.connected) {
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

// Build context for generation
async function buildContext(query) {
    if (!dbMemoryState.connected) {
        throw new Error('Not connected to backend');
    }
    
    const context = getContext();
    const chatId = context.chatId;
    const characterId = context.characterId;
    
    const response = await apiCall('/api/context', {
        method: 'POST',
        body: JSON.stringify({
            query: query,
            chatId: chatId || null,
            characterId: characterId || null,
            types: [],
            memoryLimit: dbMemoryState.settings.memoriesPerContext,
            messageLimit: dbMemoryState.settings.messagesPerSync,
            similarityThreshold: dbMemoryState.settings.similarityThreshold
        })
    });
    
    return response;
}

// Update connection status display
function updateConnectionStatus() {
    const statusEl = $('#db_memory_status');
    if (!statusEl.length) return;
    
    if (dbMemoryState.connected) {
        statusEl.text('Connected').css({ background: '#d4edda', color: '#155724' });
    } else {
        statusEl.text('Disconnected').css({ background: '#f8d7da', color: '#721c24' });
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = $('#db_memory_status_msg');
    if (!statusEl.length) return;
    
    const colors = {
        success: { bg: '#d4edda', color: '#155724' },
        error: { bg: '#f8d7da', color: '#721c24' },
        info: { bg: '#d1ecf1', color: '#0c5460' }
    };
    
    const color = colors[type] || colors.info;
    statusEl.text(message).css(color).show();
    
    setTimeout(() => statusEl.fadeOut(), 3000);
}

// Toggle expanded view
function toggleExpanded() {
    dbMemoryState.isExpanded = !dbMemoryState.isExpanded;
    updateUI();
}

// Initialize extension UI
function initializeExtensionUI() {
    const uiHTML = `
        <div id="db_memory_extension_panel" style="padding: 15px;">
            <h3 style="margin-top: 0; display: flex; align-items: center; justify-content: space-between;">
                DB Memory
                <button id="db_memory_toggle_btn" style="background: none; border: none; color: inherit; font-size: 18px; cursor: pointer;">
                    ${dbMemoryState.isExpanded ? '▲' : '▼'}
                </button>
            </h3>
            
            <div id="db_memory_content" style="${dbMemoryState.isExpanded ? '' : 'display: none;'}">
                <div style="margin-bottom: 15px;">
                    <input type="text" id="db_memory_backend_url" placeholder="Backend URL" style="width: 100%; padding: 8px; margin-bottom: 5px;" value="${dbMemoryState.backendUrl}">
                    <input type="text" id="db_memory_username" placeholder="Username" style="width: 100%; padding: 8px; margin-bottom: 5px;" value="${dbMemoryState.username}">
                    <input type="password" id="db_memory_password" placeholder="Password" style="width: 100%; padding: 8px; margin-bottom: 5px;">
                    
                    <button id="db_memory_connect_btn" style="padding: 8px 15px; margin-right: 10px; background: #007bff; color: white; border: none; border-radius: 4px;">Connect</button>
                    <button id="db_memory_disconnect_btn" style="padding: 8px 15px; background: #dc3545; color: white; border: none; border-radius: 4px;">Disconnect</button>
                </div>
                
                <div id="db_memory_status" style="padding: 8px; margin-bottom: 10px; border-radius: 4px; font-weight: bold;">Disconnected</div>
                <div id="db_memory_status_msg" style="padding: 8px; border-radius: 4px; display: none;"></div>
                
                <div style="margin-bottom: 15px;">
                    <label>
                        <input type="checkbox" id="db_memory_auto_sync" ${dbMemoryState.settings.autoSync ? 'checked' : ''}> 
                        Auto-sync messages
                    </label>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>
                        <input type="checkbox" id="db_memory_auto_extraction" ${dbMemoryState.settings.enableAutoExtraction ? 'checked' : ''}> 
                        Auto-extract memories
                    </label>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>
                        <input type="checkbox" id="db_memory_context_building" ${dbMemoryState.settings.enableContextBuilding ? 'checked' : ''}> 
                        Enable context building
                    </label>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>
                        <input type="checkbox" id="db_memory_memory_search" ${dbMemoryState.settings.enableMemorySearch ? 'checked' : ''}> 
                        Enable memory search
                    </label>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>
                        <input type="checkbox" id="db_memory_real_time_sync" ${dbMemoryState.settings.enableRealTimeSync ? 'checked' : ''}> 
                        Real-time sync
                    </label>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>
                        <input type="checkbox" id="db_memory_debug_mode" ${dbMemoryState.settings.debugMode ? 'checked' : ''}> 
                        Debug mode
                    </label>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>Messages per sync:</label>
                    <input type="number" id="db_memory_messages_per_sync" min="1" max="100" value="${dbMemoryState.settings.messagesPerSync}" style="width: 100%; padding: 8px; margin-bottom: 5px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>Memories per context:</label>
                    <input type="number" id="db_memory_memories_per_context" min="1" max="50" value="${dbMemoryState.settings.memoriesPerContext}" style="width: 100%; padding: 8px; margin-bottom: 5px;">
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label>Similarity threshold:</label>
                    <input type="range" id="db_memory_similarity_threshold" min="0" max="1" step="0.1" value="${dbMemoryState.settings.similarityThreshold}" style="width: 100%;">
                    <span id="db_memory_similarity_value">${dbMemoryState.settings.similarityThreshold}</span>
                </div>
            </div>
        </div>
    `;
    
    $('#extensions_settings2').append(uiHTML);
    
    // Load saved settings
    loadSettings();
    populateSettings();
    
    // Bind events
    $('#db_memory_toggle_btn').on('click', toggleExpanded);
    $('#db_memory_connect_btn').on('click', handleConnect);
    $('#db_memory_disconnect_btn').on('click', handleDisconnect);
    
    // Listen for setting changes
    $('#db_memory_auto_sync').on('change', function() {
        dbMemoryState.settings.autoSync = $(this).prop('checked');
        saveSettings();
    });
    
    $('#db_memory_auto_extraction').on('change', function() {
        dbMemoryState.settings.enableAutoExtraction = $(this).prop('checked');
        saveSettings();
    });
    
    $('#db_memory_context_building').on('change', function() {
        dbMemoryState.settings.enableContextBuilding = $(this).prop('checked');
        saveSettings();
    });
    
    $('#db_memory_memory_search').on('change', function() {
        dbMemoryState.settings.enableMemorySearch = $(this).prop('checked');
        saveSettings();
    });
    
    $('#db_memory_real_time_sync').on('change', function() {
        dbMemoryState.settings.enableRealTimeSync = $(this).prop('checked');
        saveSettings();
    });
    
    $('#db_memory_debug_mode').on('change', function() {
        dbMemoryState.settings.debugMode = $(this).prop('checked');
        saveSettings();
    });
    
    $('#db_memory_messages_per_sync').on('change', function() {
        dbMemoryState.settings.messagesPerSync = parseInt($(this).val());
        saveSettings();
    });
    
    $('#db_memory_memories_per_context').on('change', function() {
        dbMemoryState.settings.memoriesPerContext = parseInt($(this).val());
        saveSettings();
    });
    
    $('#db_memory_similarity_threshold').on('input', function() {
        const value = parseFloat($(this).val());
        dbMemoryState.settings.similarityThreshold = value;
        $('#db_memory_similarity_value').text(value);
        saveSettings();
    });
    
    // Try auto-connect on page load
    if (dbMemoryState.backendUrl && dbMemoryState.username && dbMemoryState.password) {
        setTimeout(() => handleConnect(), 1000);
    }
}

// Update UI
function updateUI() {
    const content = $('#db_memory_content');
    const toggleBtn = $('#db_memory_toggle_btn');
    
    if (dbMemoryState.isExpanded) {
        content.show();
        toggleBtn.text('▲');
    } else {
        content.hide();
        toggleBtn.text('▼');
    }
}

// Handle connect
async function handleConnect() {
    const url = $('#db_memory_backend_url').val().trim();
    const user = $('#db_memory_username').val().trim();
    const pass = $('#db_memory_password').val();
    
    if (!url || !user || !pass) {
        showStatus('Please fill all fields', 'error');
        return;
    }
    
    dbMemoryState.backendUrl = url;
    dbMemoryState.username = user;
    dbMemoryState.password = pass;
    
    showStatus('Connecting...', 'info');
    
    try {
        await authenticate();
        showStatus('Connected successfully!', 'success');
    } catch (error) {
        dbMemoryState.connected = false;
        updateConnectionStatus();
        showStatus(`Connection failed: ${error.message}`, 'error');
    }
}

// Handle disconnect
function handleDisconnect() {
    dbMemoryState.connected = false;
    dbMemoryState.jwtToken = null;
    dbMemoryState.tokenExpiry = null;
    dbMemoryState.password = '';
    saveSettings();
    updateConnectionStatus();
    showStatus('Disconnected', 'info');
}

// Hook into SillyTavern message flow with eventSource
function hookIntoMessageFlow() {
    // Subscribe to eventSource for real-time message events
    if (window.eventSource && window.event_types) {
        const NEW_MESSAGE = window.event_types.NEW_MESSAGE;
        const CHAT_CHANGED = window.event_types.CHAT_CHANGED;
        
        window.eventSource.addEventListener(NEW_MESSAGE, async (msg) => {
            if (!dbMemoryState.connected || !dbMemoryState.settings.autoSync) return;
            
            try {
                const content = msg.message?.mes || msg.message || msg.mes || '';
                if (!content) return;
                
                const messageId = msg.message?.id || msg.id;
                
                // Skip if already processed
                if (dbMemoryState.lastProcessedMessageId === messageId) return;
                dbMemoryState.lastProcessedMessageId = messageId;
                
                const role = (msg.author === 'user' || msg.is_user) ? 'user' : 'assistant';
                
                if (dbMemoryState.settings.debugMode) {
                    console.log('[DB Memory] Auto-saved:', { content: content.substring(0, 30), role });
                }
                
                // Process the message
                await processMessage(content, role);
            } catch (error) {
                if (dbMemoryState.settings.debugMode) {
                    console.error('[DB Memory] Error:', error);
                }
            }
        });
        
        window.eventSource.addEventListener(CHAT_CHANGED, () => {
            dbMemoryState.lastProcessedMessageId = null;
        });
    }
}

// Initialize when document is ready
$(document).ready(function() {
    console.log('[DB Memory Ultra] Initializing...');
    
    const settingsContainer = $('#extensions_settings2');
    if (settingsContainer.length > 0) {
        initializeExtensionUI();
    }
    
    // Hook into message flow
    hookIntoMessageFlow();
    
    // Auto-connect if we have credentials
    loadSettings();
    if (dbMemoryState.backendUrl && dbMemoryState.username && dbMemoryState.password) {
        if (dbMemoryState.jwtToken && dbMemoryState.tokenExpiry) {
            const now = new Date();
            const expiry = new Date(dbMemoryState.tokenExpiry);
            if (now < expiry) {
                dbMemoryState.connected = true;
                updateConnectionStatus();
            }
        }
    }
    
    console.log('[DB Memory Ultra] Initialized');
});