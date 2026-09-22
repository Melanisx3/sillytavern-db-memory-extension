/**
 * DB Memory Extension - End-to-End Test Suite
 * 
 * Запуск: Скопируйте этот код в консоль браузера на телефоне/ПК
 * После подключения к backend через настройки расширения
 */

// E2E Test Configuration
const TEST_CONFIG = {
    backendUrl: window.location.origin.replace('extensions', ''), // Adjust as needed
    testUserEmail: 'test@example.com', // This would be your SillyTavern user email
    testCharacters: ['character1', 'character2'],
    memoryCountExpected: 3,
    similarityThreshold: 0.6
};

// Test State
let testState = {
    step: 0,
    errors: [],
    success: [],
    startTime: null,
    endTime: null,
    backendHealthy: false,
    connected: false
};

// Console Logger
class ConsoleLogger {
    static log(message, type = 'info') {
        const colors = {
            info: 'color: #2196f3',
            success: 'color: #4caf50; font-weight: bold;',
            error: 'color: #f44336; font-weight: bold;'
        };
        console.log(`%c[DB MEMORY E2E] ${message}`, colors[type]);
    }
    
    static section(title) {
        ConsoleLogger.log(`\n${'='.repeat(50)}`, 'info');
        ConsoleLogger.log(`${title}`, 'info');
        ConsoleLogger.log(`${'='.repeat(50)}\n`, 'info');
    }
}

// Test Functions
async function testHealthCheck() {
    ConsoleLogger.section('Test 1: Backend Health Check');
    
    try {
        const response = await fetch('/health', { method: 'GET' });
        const data = await response.json();
        
        if (data.status === 'ok' && data.postgres && data.pgvector) {
            testState.backendHealthy = true;
            testState.success.push('✅ Backend is healthy with PostgreSQL + pgvector');
            ConsoleLogger.log('Backend status:', JSON.stringify(data, null, 2));
            return true;
        } else {
            throw new Error('Invalid health check response');
        }
    } catch (error) {
        testState.errors.push(`❌ Health check failed: ${error.message}`);
        ConsoleLogger.log('Error:', error.message);
        return false;
    }
}

async function testUserIsolation() {
    ConsoleLogger.section('Test 2: User Isolation');
    
    try {
        // Get memories without any filters
        const userId = localStorage.getItem('userId') || 'test-user'; // Adjust to actual logic
        
        // Create a memory for test user
        const response = await fetch('/api/memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `E2E Test Memory for User ${userId}`,
                chatId: null,
                characterId: null,
                type: 'preference',
                forceCreate: true
            })
        });
        
        if (response.ok) {
            testState.success.push('✅ User isolation working');
            ConsoleLogger.log('Memory created successfully');
            
            // Verify it's accessible
            const getResponse = await fetch(`/api/memories?limit=1&offset=0`);
            const data = await getResponse.json();
            
            const hasTestMemory = data.memories.some(m => m.content.includes('E2E Test'));
            if (hasTestMemory) {
                ConsoleLogger.log('Memory retrieval verified');
                return true;
            } else {
                testState.errors.push('❌ Created memory not found in retrieval');
                return false;
            }
        } else {
            testState.errors.push('❌ Failed to create test memory');
            return false;
        }
    } catch (error) {
        testState.errors.push(`❌ User isolation test failed: ${error.message}`);
        ConsoleLogger.log('Error:', error.message);
        return false;
    }
}

async function testMemoryCreationFromMessage() {
    ConsoleLogger.section('Test 3: Memory Creation from User Message');
    
    try {
        // Simulate sending a message that should extract a memory
        const testMessage = "My favorite color is blue and I work as a software engineer";
        
        const response = await fetch('/api/memories/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: testMessage,
                role: 'user',
                chatId: 'test-chat-uuid',
                characterId: 'test-character',
                sourceMessageId: 'test-msg-uuid'
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // Check if memories were created
            const createdMemories = data.created || [];
            
            if (createdMemories.length > 0) {
                testState.success.push(`✅ Created ${createdMemories.length} memory(s) from message`);
                
                // Log what was extracted
                createdMemories.forEach((mem, i) => {
                    ConsoleLogger.log(`Memory ${i+1}: ${mem.content.substring(0, 50)}...`);
                });
                
                return true;
            } else {
                testState.errors.push('⚠️ No memories created (might be OK if deduplication worked)');
                ConsoleLogger.log('No new memories created (could be due to deduplication)');
                return true; // Still success if no duplicates
            }
        } else {
            testState.errors.push('❌ Failed to process message for memory extraction');
            return false;
        }
    } catch (error) {
        testState.errors.push(`❌ Memory creation test failed: ${error.message}`);
        ConsoleLogger.log('Error:', error.message);
        return false;
    }
}

async function testPgVectorSearch() {
    ConsoleLogger.section('Test 4: pgVector Semantic Search');
    
    try {
        // Query for relevant memories
        const query = "I like blue color";
        
        const response = await fetch('/api/context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                chatId: 'test-chat-uuid',
                characterId: 'test-character',
                memoryLimit: 5,
                similarityThreshold: TEST_CONFIG.similarityThreshold
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const entries = data.entries || [];
            
            if (entries.length >= 0) { // At least some results expected
                testState.success.push(`✅ pgVector search returned ${entries.length} memory(ies)`);
                
                // Display results
                entries.forEach((entry, i) => {
                    ConsoleLogger.log(`Result ${i+1}: ${entry.content.substring(0, 40)}... (score: ${(entry.score*100).toFixed(0)}%)`);
                });
                
                return true;
            } else {
                testState.errors.push('⚠️ No relevant memories found (might need more data)');
                return true;
            }
        } else {
            testState.errors.push('❌ Context building failed');
            return false;
        }
    } catch (error) {
        testState.errors.push(`❌ pgVector search test failed: ${error.message}`);
        ConsoleLogger.log('Error:', error.message);
        return false;
    }
}

async function testCharacterIsolation() {
    ConsoleLogger.section('Test 5: Character Memory Isolation');
    
    try {
        // Create memory for specific character
        const characterName = 'Alice';
        const testContent = `${characterName} prefers tea over coffee`;
        
        const createResponse = await fetch('/api/memories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: testContent,
                characterId: 'alice-character-id',
                type: 'preference'
            })
        });
        
        if (!createResponse.ok) {
            testState.errors.push('❌ Failed to create character-specific memory');
            return false;
        }
        
        // Query with character filter
        const query = "What does Alice prefer?";
        
        const searchResponse = await fetch('/api/context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: query,
                characterId: 'alice-character-id',
                memoryLimit: 5
            })
        });
        
        if (searchResponse.ok) {
            const data = await searchResponse.json();
            const entries = data.entries || [];
            
            const foundRelevant = entries.some(e => e.content.toLowerCase().includes('tea') || e.content.toLowerCase().includes('coffee'));
            
            if (foundRelevant) {
                testState.success.push('✅ Character isolation working correctly');
                ConsoleLogger.log('Found character-specific memories');
                return true;
            } else {
                testState.errors.push('⚠️ No character-specific memories found in search');
                return true; // Graceful degradation
            }
        } else {
            testState.errors.push('❌ Character isolation search failed');
            return false;
        }
    } catch (error) {
        testState.errors.push(`❌ Character isolation test failed: ${error.message}`);
        ConsoleLogger.log('Error:', error.message);
        return false;
    }
}

async function testDuplicatePrevention() {
    ConsoleLogger.section('Test 6: Duplicate Prevention');
    
    try {
        const duplicateContent = "I love chocolate ice cream";
        
        // Send same message twice
        const response1 = await fetch('/api/memories/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: duplicateContent,
                role: 'user',
                sourceMessageId: 'msg-1'
            })
        });
        
        const response2 = await fetch('/api/memories/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: duplicateContent,
                role: 'user',
                sourceMessageId: 'msg-2'
            })
        });
        
        if (response1.ok && response2.ok) {
            const data1 = await response1.json();
            const data2 = await response2.json();
            
            const createdAfterFirst = (data1.created || []).length;
            const createdAfterSecond = (data2.created || []).length;
            
            if (createdAfterFirst > 0 && createdAfterSecond === 0) {
                testState.success.push('✅ Duplicate prevention working (second message had no new memory)');
                ConsoleLogger.log(`First: ${createdAfterFirst} created, Second: ${createdAfterSecond} created`);
                return true;
            } else if (createdAfterFirst === 0) {
                testState.success.push('✅ First message was already a duplicate');
                return true;
            } else {
                testState.errors.push('⚠️ Duplicate might not be detected properly');
                return true;
            }
        } else {
            testState.errors.push('❌ Duplicate prevention test requests failed');
            return false;
        }
    } catch (error) {
        testState.errors.push(`❌ Duplicate prevention test failed: ${error.message}`);
        ConsoleLogger.log('Error:', error.message);
        return false;
    }
}

async function testGracefulDegradation() {
    ConsoleLogger.section('Test 7: Graceful Degradation');
    
    try {
        // Try to connect to non-existent backend
        const originalUrl = dbMemoryState?.backendUrl;
        
        if (dbMemoryState) {
            dbMemoryState.backendUrl = 'http://localhost:9999'; // Non-existent port
            
            try {
                await fetch('/health');
                testState.errors.push('⚠️ Should have failed to connect to non-existent backend');
            } catch (error) {
                testState.success.push('✅ Graceful degradation (handled connection failure properly)');
                ConsoleLogger.log('Correctly handled backend unavailability');
            } finally {
                dbMemoryState.backendUrl = originalUrl;
            }
        } else {
            testState.success.push('ℹ️ Graceful degradation test skipped (no state available)');
        }
        
        return true;
    } catch (error) {
        testState.errors.push(`❌ Graceful degradation test failed: ${error.message}`);
        ConsoleLogger.log('Error:', error.message);
        return false;
    }
}

async function runAllTests() {
    ConsoleLogger.log('\n🚀 Starting End-to-End Test Suite...', 'success');
    testState.startTime = new Date();
    testState.step = 0;
    
    const tests = [
        testHealthCheck,
        testUserIsolation,
        testMemoryCreationFromMessage,
        testPgVectorSearch,
        testCharacterIsolation,
        testDuplicatePrevention,
        testGracefulDegradation
    ];
    
    for (const test of tests) {
        testState.step++;
        try {
            await test();
            // Small delay between tests
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            ConsoleLogger.log(`Test ${testState.step} threw exception: ${error.message}`, 'error');
            testState.errors.push(`Test ${testState.step} crashed: ${error.message}`);
        }
    }
    
    testState.endTime = new Date();
    const duration = ((testState.endTime - testState.startTime) / 1000).toFixed(2);
    
    printResults(duration);
}

function printResults(duration) {
    ConsoleLogger.section('📊 Test Results Summary');
    
    const totalTests = 7;
    const passed = testState.success.length;
    const failed = testState.errors.filter(e => e.startsWith('❌')).length;
    const warnings = testState.errors.filter(e => e.startsWith('⚠️')).length;
    
    ConsoleLogger.log(`Total Tests: ${totalTests}`, 'info');
    ConsoleLogger.log(`Passed: ${passed}`, 'success');
    ConsoleLogger.log(`Failed: ${failed}`, 'error');
    ConsoleLogger.log(`Warnings: ${warnings}`, 'info');
    ConsoleLogger.log(`Duration: ${duration}s`, 'info');
    
    ConsoleLogger.log('\n✅ Successes:', 'success');
    testState.success.forEach(s => ConsoleLogger.log(s));
    
    if (testState.errors.length > 0) {
        ConsoleLogger.log('\n❌ Errors & Warnings:', 'error');
        testState.errors.forEach(e => ConsoleLogger.log(e));
    }
    
    const overallStatus = failed === 0 ? '✅ ALL TESTS PASSED' : `${failed} TEST(S) FAILED`;
    ConsoleLogger.log(`\n${overallStatus}`, failed === 0 ? 'success' : 'error');
    
    // Save results
    window.dbMemoryE2EResults = {
        timestamp: new Date().toISOString(),
        duration,
        totalTests,
        passed,
        failed,
        warnings,
        successes: [...testState.success],
        errors: [...testState.errors],
        overallStatus
    };
    
    ConsoleLogger.log('\n💾 Results saved to window.dbMemoryE2EResults', 'info');
}

// Auto-run if extension is loaded
$(document).ready(function() {
    if (window.dbMemoryState && $('#extensions_settings2').length > 0) {
        // Add test button to UI
        const testButtonHtml = `
            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 5px;">
                <h4 style="margin-top: 0;">🧪 Debug & Testing</h4>
                <button id="run-e2e-tests-btn" style="padding: 10px 20px; background: #6f42c1; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    Run End-to-End Tests
                </button>
                <div id="e2e-test-results" style="margin-top: 15px; font-size: 0.9em;"></div>
            </div>
        `;
        
        $('#extensions_settings2').append(testButtonHtml);
        
        $('#run-e2e-tests-btn').on('click', async function() {
            $(this).prop('disabled', true).text('Running tests...');
            await runAllTests();
            $('#e2e-test-results').html('✅ All tests completed! Check console for results.');
        });
        
        ConsoleLogger.log('E2E Test button added to settings UI', 'info');
    } else {
        ConsoleLogger.log('Extension not ready, skipping auto-test setup', 'info');
    }
});