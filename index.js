/**
 * SillyTavern DB/Memory Extension - Main Entry Point
 * Client for Backend API (JWT Bearer tokens, PostgreSQL + pgvector)
 */

(function() {
    'use strict';

    // ==================== State ====================
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
        processedMessages: new Set(),
        syncQueue: [],
        syncInProgress: false
    };

    // ==================== Persistence ====================
    async function loadState() {
        try {
            let stored;
            if (window.extensionAPI?.storage) {
                stored = await window.extensionAPI.storage.get('db-memory-settings');
            } else {
                stored = JSON.parse(localStorage.getItem('db-memory-settings') || '{}');
            }
            if (stored) {
                state.backendUrl = stored.backendUrl || '';
                state.username = stored.username || '';
                state.password = stored.password || '';
                state.jwtToken = stored.jwtToken || null;
                state.tokenExpiry = stored.tokenExpiry ? new Date(stored.tokenExpiry) : null;
                if (stored.processedMessages) {
                    state.processedMessages = new Set(stored.processedMessages);
                }
                if (stored.settings) {
                    state.settings = { ...state.settings, ...stored.settings };
                }
                state.lastSyncedMessageId = stored.lastSyncedMessageId || null;
            }
        } catch (e) {
            console.error('[DB Memory] Failed to load state:', e);
        }
    }

    function saveState() {
        try {
            const data = {
                backendUrl: state.backendUrl,
                username: state.username,
                password: state.password,
                jwtToken: state.jwtToken,
                tokenExpiry: state.tokenExpiry?.toISOString(),
                processedMessages: Array.from(state.processedMessages).slice(-1000),
                lastSyncedMessageId: state.lastSyncedMessageId,
                settings: state.settings
            };
            if (window.extensionAPI?.storage) {
                window.extensionAPI.storage.set('db-memory-settings', data);
            } else {
                localStorage.setItem('db-memory-settings', JSON.stringify(data));
            }
        } catch (e) {
            console.error('[DB Memory] Failed to save state:', e);
        }
    }

    // ==================== HTTP Client ====================
    function buildHeaders(extra) {
        const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
        if (state.jwtToken && !state.isTokenExpired()) {
            headers['Authorization'] = `Bearer ${state.jwtToken}`;
        }
        return headers;
    }

    function isTokenExpired() {
        if (!state.tokenExpiry) return false;
        return new Date() >= state.tokenExpiry;
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

                // 401/403 — try re-login
                if ((resp.status === 401 || resp.status === 403) && state.jwtToken && !path.includes('/api/auth')) {
                    await reLogin();
                    // retry with fresh token
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

    // ==================== Auth (JWT) ====================
    async function reLogin() {
        if (!state.username || !state.password) return;
        try {
            const data = await request('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username: state.username, password: state.password })
            });
            if (data?.token) {
                state.jwtToken = data.token;
                // Token expiry from JWT payload or default
                try {
                    const payload = JSON.parse(atob(data.token.split('.')[1]));
                    state.tokenExpiry = new Date(payload.exp * 1000);
                } catch { /* ignore invalid JWT decode */ }
                saveState();
            }
        } catch (e) {
            console.error('[DB Memory] Re-login failed:', e);
            state.connected = false;
            dispatchEvent('connectionChanged', { connected: false, error: e.message });
            throw e;
        }
    }

    async function login() {
        // Try existing token first
        if (state.jwtToken && !isTokenExpired()) {
            try {
                const data = await request('/api/auth/test-token', { method: 'POST' });
                state.connected = true;
                dispatchEvent('connectionChanged', { connected: true, error: null });
                return true;
            } catch { /* fallthrough to full login */ }
        }
        await reLogin();
        state.connected = true;
        dispatchEvent('connectionChanged', { connected: true, error: null });
        return true;
    }

    function logout() {
        state.jwtToken = null;
        state.tokenExpiry = null;
        state.connected = false;
        state.password = '';
        saveState();
        dispatchEvent('connectionChanged', { connected: false, error: null });
    }

    async function testConnection() {
        try {
            await request('/health', { method: 'GET' });
            return true;
        } catch (e) {
            throw e;
        }
    }

    // ==================== Events ====================
    function dispatchEvent(name, detail) {
        document.dispatchEvent(new CustomEvent(`db-memory:${name}`, { detail }));
    }

    // ==================== Public API ====================
    window.DBMemoryExtension = {
        version: '1.0.1',

        isConnected: () => state.connected,

        connect: async function() {
            if (!state.backendUrl || !state.username || !state.password) {
                throw new Error('Missing connection credentials');
            }
            await testConnection();
            return login();
        },

        disconnect: () => logout(),

        getState: () => ({
            connected: state.connected,
            backendUrl: state.backendUrl,
            hasToken: !!state.jwtToken,
            settings: { ...state.settings }
        }),

        updateSettings: function(s) {
            Object.assign(state.settings, s);
            saveState();
            dispatchEvent('settingsChanged', { settings: state.settings });
        },

        getSettings: () => ({ ...state.settings }),

        setCredentials: function(username, password) {
            state.username = username;
            state.password = password;
            saveState();
        },

        setBaseUrl: function(url) {
            state.backendUrl = url.replace(/\/$/, '');
            saveState();
        },

        clearCredentials: () => {
            state.password = '';
            state.jwtToken = null;
            state.tokenExpiry = null;
            state.connected = false;
            saveState();
        },

        refreshContext: ContextUI.refresh,

        listMemories: MemoriesUI.list,

        deleteMemory: MemoriesUI.delete,

        syncAllMessages: ChatIntegration.syncAll
    };

    // ==================== Messages API (Backend schema) ====================
    const MessagesAPI = {
        /**
         * Create a message — requires chatId (UUID), role, content
         * Note: chatId must exist in the database (assertChatOwnership)
         */
        async create(chatId, role, content) {
            return request('/api/messages', {
                method: 'POST',
                body: JSON.stringify({ chatId, role, content })
            });
        },

        /**
         * List messages for user or filtered by chatId
         */
        async list(chatId) {
            const params = chatId ? `?chatId=${encodeURIComponent(chatId)}` : '';
            return request(`/api/messages${params}`, { method: 'GET' });
        },

        async getById(id) {
            return request(`/api/messages/${id}`, { method: 'GET' });
        },

        async update(id, { content, role }) {
            return request(`/api/messages/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ content, role })
            });
        },

        async delete(id) {
            return request(`/api/messages/${id}`, { method: 'DELETE' });
        }
    };

    // ==================== Memories API (Backend schema) ====================
    const MemoriesAPI = {
        /**
         * List memories — supports ?type=&minImportance=&limit=&offset=
         */
        async list(filters = {}) {
            const p = new URLSearchParams();
            if (filters.type) p.set('type', filters.type);
            if (filters.chatId) p.set('chatId', filters.chatId);
            if (filters.characterId) p.set('characterId', filters.characterId);
            if (filters.minImportance !== undefined) p.set('minImportance', filters.minImportance);
            if (filters.limit) p.set('limit', filters.limit);
            if (filters.offset) p.set('offset', filters.offset);
            const qs = p.toString();
            return request(`/api/memories${qs ? '?' + qs : ''}`, { method: 'GET' });
        },

        async getById(id) {
            return request(`/api/memories/${id}`, { method: 'GET' });
        },

        /**
         * Create memory — supports content, chatId, characterId, type, importance, confidence, sourceMessageId
         */
        async create(body) {
            return request('/api/memories', {
                method: 'POST',
                body: JSON.stringify(body)
            });
        },

        /**
         * Process message through memory engine — extracts memories automatically
         */
        async process(content, opts = {}) {
            return request('/api/memories/process', {
                method: 'POST',
                body: JSON.stringify({
                    content,
                    role: opts.role || 'user',
                    chatId: opts.chatId || null,
                    characterId: opts.characterId || null,
                    sourceMessageId: opts.sourceMessageId || null
                })
            });
        },

        async update(id, body) {
            return request(`/api/memories/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(body)
            });
        },

        async delete(id) {
            return request(`/api/memories/${id}`, { method: 'DELETE' });
        }
    };

    // ==================== Context API (Backend schema) ====================
    const ContextAPI = {
        /**
         * Build context — POST with query body
         * Returns: { entries: [...], recentMessages: [...], contextText: string }
         */
        async build(query, opts = {}) {
            return request('/api/context', {
                method: 'POST',
                body: JSON.stringify({
                    query,
                    chatId: opts.chatId || null,
                    characterId: opts.characterId || null,
                    types: opts.types || [],
                    memoryLimit: opts.memoryLimit ?? state.settings.memoriesPerContext,
                    messageLimit: Math.min(state.settings.messagesPerSync * 2, 50),
                    similarityThreshold: opts.similarityThreshold ?? state.settings.similarityThreshold,
                    minImportance: opts.minImportance
                })
            });
        }
    };

    // ==================== Context UI ====================
    const ContextUI = {
        async refresh(opts) {
            if (!state.connected) {
                this.renderEmpty(document.getElementById('memory-context-list'), 'Not connected to backend');
                return;
            }

            const chatId = window.chat_id || (opts && opts.chatId);
            const characterId = window.character_id || (opts && opts.characterId);

            if (!chatId) {
                this.renderEmpty(document.getElementById('memory-context-list'), 'No active chat selected');
                return;
            }

            const lastMsg = this.getLastChatMessage();
            if (!lastMsg) {
                this.renderEmpty(document.getElementById('memory-context-list'), 'No messages yet — send a message to get context');
                return;
            }

            try {
                const data = await ContextAPI.build(lastMsg, {
                    chatId,
                    characterId,
                    memoryLimit: state.settings.memoriesPerContext,
                    similarityThreshold: state.settings.similarityThreshold
                });

                this.renderList(data.entries || [], data.recentMessages || []);
            } catch (e) {
                this.renderError(document.getElementById('memory-context-list'), `Failed to load context: ${e.message}`);
            }
        },

        getLastChatMessage() {
            // SillyTavern provides chat_log as array of messages
            const log = window.chat_log || [];
            if (log.length === 0) return null;
            const msg = log[log.length - 1];
            return msg.mes || msg.content || msg.text || JSON.stringify(msg);
        },

        renderList(entries, recentMessages) {
            const container = document.getElementById('memory-context-list');
            if (!container) return;

            if (!entries || entries.length === 0) {
                this.renderEmpty(container, 'No relevant memories found');
                return;
            }

            const totalScore = entries.reduce((s, e) => s + (e.score || 0), 0);
            const avgScore = entries.length > 0 ? totalScore / entries.length : 0;

            container.innerHTML = `
                <div class="context-stats">
                    <span class="stat-item"><span class="stat-label">Memories</span><span class="stat-value">${entries.length}</span></span>
                    <span class="stat-item"><span class="stat-label">Avg Score</span><span class="stat-value">${(avgScore * 100).toFixed(1)}%</span></span>
                </div>
                ${entries.map(e => `
                    <div class="context-item importance-${e.importance || 'normal'}" data-memory-id="${e.id}">
                        <div class="context-header">
                            <span class="context-type">${e.type || 'memory'}</span>
                            ${state.settings.showRelevanceScores ? `<span class="relevance-badge">${(e.score * 100).toFixed(1)}%</span>` : ''}
                        </div>
                        <div class="context-content">${this.escapeHtml(e.content || '')}</div>
                        <div class="context-footer">
                            <span>Importance: ${(e.importance ?? '-').toString()}</span>
                            <span>Type: ${e.type || '-'}</span>
                        </div>
                    </div>
                `).join('')}
            `;
        },

        renderEmpty(container, msg) {
            if (!container) return;
            container.innerHTML = `<div class="empty-state">${msg || 'Connect to backend'}</div>`;
            document.getElementById('stat-memory-count').textContent = '0';
            document.getElementById('stat-avg-relevance').textContent = '-';
        },

        renderError(container, msg) {
            if (!container) return;
            container.innerHTML = `<div class="error-state">${msg}</div>`;
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // ==================== Memories UI ====================
    const MemoriesUI = {
        page: 1,
        limit: 20,

        async list(filters) {
            if (!state.connected) {
                document.getElementById('memory-list') &&
                    (document.getElementById('memory-list').innerHTML = '<div class="empty-state">Not connected to backend</div>');
                return;
            }

            try {
                const data = await MemoriesAPI.list({
                    ...filters,
                    offset: (this.page - 1) * this.limit,
                    limit: this.limit
                });
                this.renderList(data.memories || []);
            } catch (e) {
                this.renderError(document.getElementById('memory-list'), `Failed to load: ${e.message}`);
            }
        },

        renderList(memories) {
            const container = document.getElementById('memory-list');
            if (!container) return;

            if (memories.length === 0) {
                container.innerHTML = '<div class="empty-state">No memories found</div>';
                return;
            }

            container.innerHTML = memories.map(m => {
                const dateStr = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-';
                const impClass = `importance-${m.importance ?? 'normal'}`;
                return `
                    <div class="memory-item ${impClass}" data-memory-id="${m.id}">
                        <div class="memory-header">
                            <span class="memory-type">${m.type || 'memory'}</span>
                            <span class="memory-importance">${m.importance ?? '-'}</span>
                            ${state.settings.showRelevanceScores && m.confidence != null
                                ? `<span class="relevance-score">${(m.confidence * 100).toFixed(1)}%</span>`
                                : ''}
                        </div>
                        <div class="memory-content">${this.escapeHtml(m.content || '')}</div>
                        <div class="memory-meta">
                            <span>${dateStr}</span>
                            ${m.characterId ? `<span>${this.escapeHtml(m.characterId)}</span>` : ''}
                        </div>
                        <div class="memory-actions">
                            <button class="action-btn delete-btn" onclick="MemoriesUI.delete('${m.id}')">🗑️ Delete</button>
                        </div>
                    </div>
                `;
            }).join('');
        },

        async delete(id) {
            if (!confirm('Delete this memory?')) return;
            try {
                await MemoriesAPI.delete(id);
                this.list({});
            } catch (e) {
                alert(`Failed to delete: ${e.message}`);
            }
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // ==================== Chat Integration ====================
    const ChatIntegration = {
        async handleNewMessage(messageId) {
            if (!state.connected) return;
            if (state.processedMessages.has(messageId)) return;
            if (!state.settings.autoSync) return;

            state.processedMessages.add(messageId);
            saveState();

            const msg = await this.getMessageById(messageId);
            if (!msg) return;

            // Only sync assistant responses (they are what the AI "learns")
            // For user messages, they can be used in context but don't need separate message store
            const role = msg.is_user ? 'user' : 'assistant';
            const content = msg.mes || msg.content || '';
            if (!content.trim()) return;

            try {
                const chatId = msg.chat_id || window.chat_id;
                await MessagesAPI.create(chatId, role, content);

                // Auto-extract memories from the message
                if (state.settings.enableAutoExtraction) {
                    try {
                        await MemoriesAPI.process(content, {
                            chatId,
                            role,
                            characterId: window.character_id
                        });
                    } catch { /* non-critical */ }
                }
            } catch (e) {
                console.error('[DB Memory] Sync failed:', e);
            }
        },

        async getMessageById(messageId) {
            const logs = window.chat_log || [];
            return logs.find(m => m.swipe_id == messageId || m.id == messageId);
        },

        async syncAll() {
            if (!state.connected) return;
            const logs = window.chat_log || [];
            for (const msg of logs) {
                const mid = msg.swipe_id || msg.id;
                if (mid && !state.processedMessages.has(mid)) {
                    await this.handleNewMessage(mid);
                }
            }
        },

        init() {
            document.addEventListener('chat_message_received', (e) => {
                this.handleNewMessage(e.detail.messageId || e.detail.id);
            });

            document.addEventListener('chat_changed', () => {
                ContextUI.refresh();
            });
        }
    };

    // ==================== Init ====================
    async function init() {
        console.log('[DB Memory] Initializing...');
        await loadState();

        // Listen for state changes
        document.addEventListener('db-memory:settingsChanged', () => {
            saveState();
        });

        // Load form values
        populateForm();

        // Button bindings
        bindButtons();

        // Auto-connect if we have credentials and saved token
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

        // Initialize chat integration
        ChatIntegration.init();

        console.log('[DB Memory] Initialized');
    }

    function populateForm() {
        const el = (id) => document.getElementById(id);
        if (el('backend-url')) el('backend-url').value = state.backendUrl;
        if (el('username')) el('username').value = state.username;
        if (el('password')) el('password').value = state.password;
        if (el('auto-sync')) el('auto-sync').checked = state.settings.autoSync;
        if (el('auto-extraction')) el('auto-extraction').checked = state.settings.enableAutoExtraction;
        if (el('messages-per-sync')) el('messages-per-sync').value = state.settings.messagesPerSync;
        if (el('memories-per-context')) el('memories-per-context').value = state.settings.memoriesPerContext;
        if (el('similarity-threshold')) el('similarity-threshold').value = state.settings.similarityThreshold;
        if (el('threshold-value')) el('threshold-value').textContent = state.settings.similarityThreshold.toFixed(2);
        if (el('show-scores')) el('show-scores').checked = state.settings.showRelevanceScores;
        if (el('debug-mode')) el('debug-mode').checked = state.settings.debugMode;

        updateConnectionStatus();
    }

    function bindButtons() {
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');

                // Trigger panel-specific actions
                if (btn.dataset.tab === 'memory') MemoriesUI.list({});
                if (btn.dataset.tab === 'context') ContextUI.refresh();
            });
        });

        // Connection
        const doConnect = async () => {
            const url = (document.getElementById('backend-url')?.value || '').trim();
            const user = (document.getElementById('username')?.value || '').trim();
            const pass = document.getElementById('password')?.value || '';

            if (!url || !user || !pass) {
                setStatus('Please fill all fields', 'error');
                return;
            }

            state.backendUrl = url;
            state.username = user;
            state.password = pass;
            setStatus('Connecting...', 'info');

            try {
                await window.DBMemoryExtension.connect();
                setStatus('Connected!', 'success');
            } catch (e) {
                setStatus(e.message, 'error');
            }
        };

        document.getElementById('btn-connect')?.addEventListener('click', doConnect);
        document.getElementById('btn-disconnect')?.addEventListener('click', () => {
            window.DBMemoryExtension.disconnect();
            document.getElementById('password').value = '';
            setStatus('Disconnected', 'info');
        });
        document.getElementById('btn-test')?.addEventListener('click', async () => {
            const url = (document.getElementById('backend-url')?.value || '').trim();
            const user = (document.getElementById('username')?.value || '').trim();
            const pass = document.getElementById('password')?.value || '';

            if (!url || !user || !pass) {
                setStatus('Please fill all fields', 'error');
                return;
            }

            setStatus('Testing...', 'info');
            try {
                state.backendUrl = url;
                state.username = user;
                state.password = pass;
                await testConnection();
                setStatus('✓ Backend reachable!', 'success');
            } catch (e) {
                setStatus(`✗ ${e.message}`, 'error');
            }
        });

        // Settings save
        document.getElementById('btn-save')?.addEventListener('click', () => {
            state.updateSettings({
                autoSync: (document.getElementById('auto-sync')?.checked ?? true),
                enableAutoExtraction: (document.getElementById('auto-extraction')?.checked ?? true),
                messagesPerSync: parseInt(document.getElementById('messages-per-sync')?.value) || 10,
                memoriesPerContext: parseInt(document.getElementById('memories-per-context')?.value) || 5,
                similarityThreshold: parseFloat(document.getElementById('similarity-threshold')?.value) ?? 0.7,
                showRelevanceScores: (document.getElementById('show-scores')?.checked ?? true),
                debugMode: (document.getElementById('debug-mode')?.checked ?? false)
            });
            setStatus('Settings saved', 'success');
        });

        // Reset
        document.getElementById('btn-reset')?.addEventListener('click', () => {
            if (!confirm('Reset to defaults?')) return;
            state.updateSettings({
                autoSync: true, enableAutoExtraction: true,
                messagesPerSync: 10, memoriesPerContext: 5,
                similarityThreshold: 0.7, showRelevanceScores: true, debugMode: false
            });
            populateForm();
            setStatus('Settings reset', 'info');
        });

        // Threshold slider
        document.getElementById('similarity-threshold')?.addEventListener('input', (e) => {
            const val = document.getElementById('threshold-value');
            if (val) val.textContent = parseFloat(e.target.value).toFixed(2);
        });

        // Memory CRUD
        document.getElementById('btn-refresh')?.addEventListener('click', () => {
            MemoriesUI.page = 1;
            MemoriesUI.list({});
        });
        document.getElementById('btn-search')?.addEventListener('click', () => {
            MemoriesUI.page = 1;
            const q = document.getElementById('memory-search')?.value || '';
            MemoriesUI.list(q ? { search: q } : {});
        });
        ['filter-type', 'filter-importance', 'sort-by'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => {
                MemoriesUI.page = 1;
                MemoriesUI.list({});
            });
        });

        document.getElementById('btn-prev-page')?.addEventListener('click', () => {
            if (MemoriesUI.page > 1) { MemoriesUI.page--; MemoriesUI.list({}); }
        });
        document.getElementById('btn-next-page')?.addEventListener('click', () => {
            MemoriesUI.page++;
            MemoriesUI.list({});
        });

        // Refresh context
        document.getElementById('btn-refresh-context')?.addEventListener('click', () => {
            ContextUI.refresh();
        });

        // New memory placeholder
        document.getElementById('btn-new-memory')?.addEventListener('click', () => {
            alert('Create memory via Backend API:\nPOST /api/memories\n{ content, type, importance, chatId, characterId }');
        });

        // Status indicator listener
        document.addEventListener('db-memory:connectionChanged', updateConnectionStatus);
    }

    function updateConnectionStatus() {
        const el = document.getElementById('connection-status');
        if (!el) return;

        if (state.connected && state.jwtToken) {
            el.className = 'status-indicator connected';
            el.innerHTML = '<span class="status-dot"></span> Connected (authed)';
        } else if (state.connected) {
            el.className = 'status-indicator info';
            el.innerHTML = '<span class="status-dot"></span> Connected';
        } else {
            el.className = 'status-indicator disconnected';
            el.innerHTML = '<span class="status-dot"></span> Disconnected';
        }
    }

    function setStatus(msg, type) {
        const el = document.getElementById('connection-status');
        if (el) {
            el.className = `status-indicator ${type || 'info'}`;
            el.innerHTML = `<span class="status-dot"></span> ${msg}`;
        }
        if (window.toast) window.toast(msg, type);
    }

    // Register with SillyTavern
    if (window.extensionAPI) {
        window.extensionAPI.register({
            name: 'DB Memory Extension',
            version: '1.0.1',
            init: init
        });
    } else {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();
