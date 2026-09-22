/**
 * DB Memory Extension - Minimal version for phone
 */
import { extension_settings, saveSettingsDebounced } from '../../../../script.js';
import { toastr } from '../../../../lib.js';

const EXTENSION_NAME = 'db_memory_minimal';

// Simple state
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

// Simple UI
function createMinimalUI() {
    return `
        <div style="padding: 20px;">
            <h3>DB Memory Extension</h3>
            <div>
                <label>Backend URL:</label>
                <input type="text" id="db_url" style="width: 100%; margin: 5px 0;" placeholder="http://192.168.1.70:3000">
            </div>
            <div>
                <label>Username:</label>
                <input type="text" id="db_user" style="width: 100%; margin: 5px 0;" placeholder="Username">
            </div>
            <div>
                <label>Password:</label>
                <input type="password" id="db_pass" style="width: 100%; margin: 5px 0;" placeholder="Password">
            </div>
            <button onclick="connectDB()" style="margin: 10px 5px;">Connect</button>
            <button onclick="disconnectDB()" style="margin: 10px 5px;">Disconnect</button>
            <div id="db_status" style="margin: 10px 0; color: red;">Not connected</div>
        </div>
    `;
}

// Connect function
window.connectDB = async function() {
    const url = document.getElementById('db_url').value;
    const user = document.getElementById('db_user').value;
    const pass = document.getElementById('db_pass').value;
    
    if (!url || !user || !pass) {
        toastr.error('Fill all fields', 'DB Memory');
        return;
    }
    
    try {
        const response = await fetch(url + '/health');
        if (response.ok) {
            state.connected = true;
            document.getElementById('db_status').textContent = 'Connected';
            document.getElementById('db_status').style.color = 'green';
            toastr.success('Connected!', 'DB Memory');
        }
    } catch (e) {
        toastr.error('Connection failed: ' + e.message, 'DB Memory');
    }
};

// Initialize
jQuery(() => {
    const container = $('#extensions_settings2');
    if (container.length > 0) {
        container.append(createMinimalUI());
    }
});