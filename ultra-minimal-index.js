/**
 * DB Memory Extension - Ultra minimal version
 * Mobile-friendly: collapsible menu with expanded settings matching SillyTavern UI
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
    const saved = extension_settings.db_memory_minimal;
    if (saved) {
        try {
            if (saved.backendUrl) dbMemoryState.backendUrl = saved.backendUrl;
            if (saved.username) dbMemoryState.username = saved.username;
            if (saved.jwtToken) dbMemoryState.jwtToken = saved.jwtToken;
            if (saved.tokenExpiry) dbMemoryState.tokenExpiry = saved.tokenExpiry;
            if (saved.settings) {
                Object.assign(dbMemoryState.settings, saved.settings);
            }
        } catch (e) {
            console.error('[DB Memory] Failed to load settings:', e);
        }
    }
}

// Save settings
function saveSettings() {
    extension_settings.db_memory_minimal = {
        backendUrl: dbMemoryState.backendUrl,
        username: dbMemoryState.username,
        jwtToken: dbMemoryState.jwtToken,
        tokenExpiry: dbMemoryState.tokenExpiry,
        settings: { ...dbMemoryState.settings }
    };
    saveSettingsDebounced();
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
        statusEl.removeClass('status-error status-info').addClass('status-ok')
            .html('<i class="fa-solid fa-circle-check"></i> Connected').show();
    } else {
        statusEl.removeClass('status-ok status-info').addClass('status-error')
            .html('<i class="fa-solid fa-circle-xmark"></i> Disconnected').show();
    }
}

// Show status message
function showStatus(message, type = 'info') {
    const statusEl = $('#db_memory_status_msg');
    if (!statusEl.length) return;
    
    statusEl.removeClass('status-ok status-error status-info');
    
    const classes = {
        success: 'status-ok',
        error: 'status-error',
        info: 'status-info'
    };
    
    const icons = {
        success: '<i class="fa-solid fa-circle-check"></i>',
        error: '<i class="fa-solid fa-triangle-exclamation"></i>',
        info: '<i class="fa-solid fa-circle-info"></i>'
    };
    
    statusEl.addClass(classes[type] || classes.info)
        .html(`${icons[type] || icons.info} ${message}`)
        .show();
    
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
        <div id="db_memory_extension_panel" class="extension-panel">
            <div class="inline-drawer-content">
                <div class="list-group-item flex-container flexGap5">
                    <div class="fa-solid fa-chevron-down extension-toggle" id="db_memory_toggle_btn" style="cursor: pointer;"></div>
                    <div class="flex-container flexFlowColumn flexGap0">
                        <div class="extension-settings-title flex-container flexAlignCenter gap5">
                            <i class="fa-solid fa-brain"></i>
                            <span>DB Memory</span>
                        </div>
                        <small class="text-muted">Vector memory & context building</small>
                    </div>
                </div>
                
                <div id="db_memory_content" class="settings-content" style="${dbMemoryState.isExpanded ? '' : 'display: none;'}">
                    <div class="list-group-item">
                        <label for="db_memory_backend_url" class="form-label">Backend URL</label>
                        <div class="flex-container flexGap5">
                            <input type="text" id="db_memory_backend_url" class="text_pole" placeholder="http://192.168.1.70:3000" value="${dbMemoryState.backendUrl}">
                        </div>
                        
                        <label for="db_memory_username" class="form-label">Username</label>
                        <input type="text" id="db_memory_username" class="text_pole" placeholder="Username" value="${dbMemoryState.username}">
                        
                        <label for="db_memory_password" class="form-label">Password</label>
                        <input type="password" id="db_memory_password" class="text_pole" placeholder="Password">
                        
                        <div class="flex-container flexGap5 margin_top_10">
                            <button id="db_memory_connect_btn" class="menu_button menu_button_icon">
                                <i class="fa-solid fa-plug"></i> Connect
                            </button>
                            <button id="db_memory_disconnect_btn" class="menu_button menu_button_icon">
                                <i class="fa-solid fa-plug-circle-xmark"></i> Disconnect
                            </button>
                        </div>
                        
                        <div id="db_memory_status" class="status-block" style="display: none;"></div>
                        <div id="db_memory_status_msg" class="status-block" style="display: none;"></div>
                    </div>
                    
                    <div class="list-group-item">
                        <h5 class="margin_bottom_10"><i class="fa-solid fa-gear"></i> Settings</h5>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="db_memory_auto_sync" ${dbMemoryState.settings.autoSync ? 'checked' : ''}> 
                                Auto-sync messages
                            </label>
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="db_memory_auto_extraction" ${dbMemoryState.settings.enableAutoExtraction ? 'checked' : ''}> 
                                Auto-extract memories
                            </label>
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="db_memory_context_building" ${dbMemoryState.settings.enableContextBuilding ? 'checked' : ''}> 
                                Enable context building
                            </label>
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="db_memory_memory_search" ${dbMemoryState.settings.enableMemorySearch ? 'checked' : ''}> 
                                Enable memory search
                            </label>
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="db_memory_real_time_sync" ${dbMemoryState.settings.enableRealTimeSync ? 'checked' : ''}> 
                                Real-time sync
                            </label>
                        </div>
                        
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" id="db_memory_debug_mode" ${dbMemoryState.settings.debugMode ? 'checked' : ''}> 
                                Debug mode
                            </label>
                        </div>
                    </div>
                    
                    <div class="list-group-item">
                        <h5 class="margin_bottom_10"><i class="fa-solid fa-sliders"></i> Advanced</h5>
                        
                        <div class="flex-container flexFlowColumn flexGap5">
                            <label for="db_memory_messages_per_sync">Messages per sync</label>
                            <input type="number" id="db_memory_messages_per_sync" class="text_pole" min="1" max="100" value="${dbMemoryState.settings.messagesPerSync}">
                            
                            <label for="db_memory_memories_per_context">Memories per context</label>
                            <input type="number" id="db_memory_memories_per_context" class="text_pole" min="1" max="50" value="${dbMemoryState.settings.memoriesPerContext}">
                            
                            <label for="db_memory_similarity_threshold">Similarity threshold: <span id="db_memory_similarity_value">${dbMemoryState.settings.similarityThreshold}</span></label>
                            <input type="range" id="db_memory_similarity_threshold" min="0" max="1" step="0.1" value="${dbMemoryState.settings.similarityThreshold}" class="slider">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $('#extensions_settings2').append(uiHTML);
    
    // Load saved settings
    loadSettings();
    
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
        content.slideDown(200);
        toggleBtn.removeClass('fa-database fa-chevron-down').addClass('fa-database fa-chevron-up');
    } else {
        content.slideUp(200);
        toggleBtn.removeClass('fa-database fa-chevron-up').addClass('fa-database fa-chevron-down');
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
    
    // Try multiple container selectors
    const containers = [
        $('#extensions_settings2'),
        $('#extensions_settings'),
        $('#extensions'),
        $('#settings')
    ];
    
    let container = containers.find(c => c.length > 0);
    
    if (container) {
        initializeExtensionUI();
    } else {
        // If no container found, try to append to body
        $('body').append(`
            <div id="db_memory_fallback_container" style="padding: 20px;">
                ${createUltraMinimalUI()}
            </div>
        `);
        
        // Bind events for fallback UI
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
        
        // Load saved settings
        loadSettings();
        populateSettings();
        
        // Try auto-connect on page load
        if (dbMemoryState.backendUrl && dbMemoryState.username && dbMemoryState.password) {
            setTimeout(() => handleConnect(), 1000);
        }
    }
    
    // Hook into message flow
    hookIntoMessageFlow();
    
    console.log('[DB Memory Ultra] Initialized');
});