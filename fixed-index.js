/**
 * SillyTavern DB/Memory Extension - Fixed version for settings visibility
 * Database-backed memory with PostgreSQL + pgvector backend
 */

// Ensure extension loads in settings
$(document).ready(function() {
    console.log('[DB Memory] Extension loaded');
    
    // Check if we're in extension settings area
    const settingsContainer = $('#extensions_settings2');
    if (settingsContainer.length > 0) {
        initializeExtensionUI();
    }
});

function initializeExtensionUI() {
    const uiHTML = `
        <div id="db_memory_extension_panel" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>DB Memory Extension</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                
                <div style="margin-bottom: 15px;">
                    <h4 style="margin: 10px 0 5px 0;">Backend Connection</h4>
                    
                    <div style="margin-bottom: 10px;">
                        <label for="db_memory_backend_url" style="display: block; margin-bottom: 5px;">Backend URL:</label>
                        <input type="text" id="db_memory_backend_url" style="width: 100%; padding: 8px; margin-bottom: 10px;" placeholder="http://10.71.147.9:3000">
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label for="db_memory_username" style="display: block; margin-bottom: 5px;">Username:</label>
                        <input type="text" id="db_memory_username" style="width: 100%; padding: 8px; margin-bottom: 10px;" placeholder="test_user">
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label for="db_memory_password" style="display: block; margin-bottom: 5px;">Password:</label>
                        <input type="password" id="db_memory_password" style="width: 100%; padding: 8px; margin-bottom: 10px;" placeholder="testpass123">
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <button id="db_memory_connect_btn" style="padding: 8px 15px; margin-right: 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Connect</button>
                        <button id="db_memory_test_btn" style="padding: 8px 15px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Test</button>
                    </div>
                    
                    <div id="db_memory_status" style="padding: 10px; margin-top: 10px; border-radius: 4px; display: none;"></div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <h4 style="margin: 10px 0 5px 0;">Settings</h4>
                    
                    <div style="margin-bottom: 10px;">
                        <label>
                            <input type="checkbox" id="db_memory_auto_sync"> Auto-sync messages
                        </label>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label for="db_memory_memories_per_context" style="display: block; margin-bottom: 5px;">Memories per context:</label>
                        <input type="number" id="db_memory_memories_per_context" style="width: 100px; padding: 5px;" min="1" max="50" value="5">
                    </div>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <button id="db_memory_save_settings" style="padding: 8px 15px; background: #ffc107; color: black; border: none; border-radius: 4px; cursor: pointer;">Save Settings</button>
                </div>
                
            </div>
        </div>
    `;
    
    $('#extensions_settings2').append(uiHTML);
    
    // Bind events
    $('#db_memory_connect_btn').on('click', handleConnect);
    $('#db_memory_test_btn').on('click', handleTest);
    $('#db_memory_save_settings').on('click', handleSave);
    
    // Load saved settings
    loadSavedSettings();
}

function handleConnect() {
    const url = $('#db_memory_backend_url').val();
    const user = $('#db_memory_username').val();
    const pass = $('#db_memory_password').val();
    
    if (!url || !user || !pass) {
        showStatus('Please fill all fields', 'error');
        return;
    }
    
    showStatus('Connecting...', 'info');
    
    // Test connection
    fetch(`${url}/health`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'ok') {
                showStatus('Connected successfully!', 'success');
            } else {
                showStatus('Connection failed: Invalid response', 'error');
            }
        })
        .catch(error => {
            showStatus(`Connection failed: ${error.message}`, 'error');
        });
}

function handleTest() {
    const url = $('#db_memory_backend_url').val();
    
    if (!url) {
        showStatus('Please enter backend URL', 'error');
        return;
    }
    
    showStatus('Testing connection...', 'info');
    
    fetch(`${url}/health`)
        .then(response => response.json())
        .then(data => {
            showStatus(`Health: ${JSON.stringify(data)}`, 'success');
        })
        .catch(error => {
            showStatus(`Test failed: ${error.message}`, 'error');
        });
}

function handleSave() {
    const settings = {
        backendUrl: $('#db_memory_backend_url').val(),
        username: $('#db_memory_username').val(),
        autoSync: $('#db_memory_auto_sync').prop('checked'),
        memoriesPerContext: parseInt($('#db_memory_memories_per_context').val()) || 5
    };
    
    // Save to localStorage (simple persistence)
    localStorage.setItem('db_memory_settings', JSON.stringify(settings));
    showStatus('Settings saved!', 'success');
}

function loadSavedSettings() {
    const saved = localStorage.getItem('db_memory_settings');
    if (saved) {
        try {
            const settings = JSON.parse(saved);
            $('#db_memory_backend_url').val(settings.backendUrl || '');
            $('#db_memory_username').val(settings.username || '');
            $('#db_memory_auto_sync').prop('checked', settings.autoSync || false);
            $('#db_memory_memories_per_context').val(settings.memoriesPerContext || 5);
        } catch (e) {
            console.error('Failed to load saved settings:', e);
        }
    }
}

function showStatus(message, type) {
    const statusEl = $('#db_memory_status');
    statusEl.text(message);
    
    switch(type) {
        case 'success':
            statusEl.css({'background': '#d4edda', 'color': '#155724', 'border': '1px solid #c3e6cb'});
            break;
        case 'error':
            statusEl.css({'background': '#f8d7da', 'color': '#721c24', 'border': '1px solid #f5c6cb'});
            break;
        case 'info':
            statusEl.css({'background': '#d1ecf1', 'color': '#0c5460', 'border': '1px solid #bee5eb'});
            break;
    }
    
    statusEl.show();
    
    setTimeout(() => {
        statusEl.fadeOut();
    }, 5000);
}

console.log('[DB Memory] Extension initialization complete');