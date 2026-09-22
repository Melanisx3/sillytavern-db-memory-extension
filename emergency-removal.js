/**
 * Emergency extension removal script
 * Run this in browser console to remove DB Memory Extension
 */
(function() {
    'use strict';
    
    console.log('🚨 Emergency DB Memory Extension Removal');
    
    // Remove extension settings
    if (window.extension_settings) {
        delete window.extension_settings.db_memory;
        delete window.extension_settings.db_memory_minimal;
        delete window.extension_settings.db_memory_ultra;
        console.log('✅ Extension settings removed');
    }
    
    // Remove from localStorage
    localStorage.removeItem('extension_settings');
    localStorage.removeItem('db_memory_settings');
    localStorage.removeItem('db_memory_backend_url');
    localStorage.removeItem('db_memory_username');
    localStorage.removeItem('db_memory_password');
    console.log('✅ localStorage cleaned');
    
    // Remove from sessionStorage
    sessionStorage.clear();
    console.log('✅ sessionStorage cleared');
    
    // Remove any DB Memory related elements
    const dbElements = document.querySelectorAll('[id*="db_memory"], [class*="db_memory"]');
    dbElements.forEach(el => {
        el.remove();
        console.log('✅ Removed element:', el.id || el.className);
    });
    
    // Remove extension containers
    const extensionContainers = document.querySelectorAll('#extensions_settings2, .extensions_settings2, [id*="extension"]');
    extensionContainers.forEach(container => {
        if (container && container.parentNode) {
            container.parentNode.removeChild(container);
            console.log('✅ Removed extension container');
        }
    });
    
    // Force reload
    console.log('🔄 Reloading page...');
    setTimeout(() => {
        location.reload();
    }, 1000);
    
    console.log('✅ Emergency removal completed');
})();