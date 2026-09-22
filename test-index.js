/**
 * DB Memory Extension - Super simple test version
 */
jQuery(() => {
    console.log('[DB Memory] Starting...');
    
    // Create simple UI
    const html = `
        <div style="border: 2px solid red; padding: 10px; margin: 10px;">
            <h3>DB Memory Extension Test</h3>
            <div id="test-status">Status: Testing...</div>
            <button onclick="testConnection()">Test Connection</button>
        </div>
    `;
    
    // Add to page
    $('body').append(html);
    
    // Test function
    window.testConnection = function() {
        const status = document.getElementById('test-status');
        status.textContent = 'Testing...';
        
        fetch('http://10.71.147.9:3000/health')
            .then(response => response.json())
            .then(data => {
                status.textContent = '✅ Connected: ' + data.status;
                status.style.color = 'green';
            })
            .catch(error => {
                status.textContent = '❌ Error: ' + error.message;
                status.style.color = 'red';
            });
    };
    
    // Auto-test
    setTimeout(() => {
        testConnection();
    }, 1000);
});