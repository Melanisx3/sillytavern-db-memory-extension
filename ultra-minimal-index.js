/**
 * DB Memory Extension - Ultra minimal version
 * Only shows connection status, no UI conflicts
 */
import { extension_settings } from '../../../../script.js';

const EXTENSION_NAME = 'db_memory_ultra';

// Minimal state
const state = {
    backendUrl: '',
    username: '',
    password: '',
    connected: false
};

// Load settings
if (!extension_settings[EXTENSION_NAME]) {
    extension_settings[EXTENSION_NAME] = {};
}

// Create minimal UI - only connection status
function createUltraMinimalUI() {
    return `
        <div style="padding: 10px; border: 1px solid #ccc; margin: 10px 0;">
            <h4 style="margin: 0 0 10px 0;">DB Memory Extension</h4>
            <div id="db_status" style="color: red;">Status: Not connected</div>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
                Backend: <span id="db_backend_url">Not set</span><br>
                Username: <span id="db_username">Not set</span>
            </div>
        </div>
    `;
}

// Initialize
jQuery(() => {
    // Only add if container exists
    const container = $('#extensions_settings2');
    if (container.length > 0) {
        container.append(createUltraMinimalUI());
    }
    
    // Simple connection test
    setTimeout(() => {
        const testUrl = 'http://192.168.1.70:3000/health';
        fetch(testUrl)
            .then(response => {
                if (response.ok) {
                    document.getElementById('db_status').textContent = 'Status: Connected';
                    document.getElementById('db_status').style.color = 'green';
                }
            })
            .catch(() => {
                console.log('Backend not available');
            });
    }, 2000);
});