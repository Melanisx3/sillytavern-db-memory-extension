/**
 * DB Memory — SillyTavern extension
 * Long-term memory backed by the PostgreSQL + pgvector backend (see /backend).
 *
 * Everything goes through the global SillyTavern.getContext(), so there are no fragile
 * relative imports and the extension works from any folder name.
 */

const MODULE = 'db_memory';
const PROMPT_KEY = 'db_memory_context';
const MEMORY_TYPES = ['fact', 'preference', 'event', 'relationship', 'character_state', 'world_information', 'important_event'];

const DEFAULTS = {
    backendUrl: '',
    username: '',
    password: '',
    token: null,
    tokenExpiry: null,
    chatMap: {}, // SillyTavern chatId -> backend chat UUID
    autoSync: true,
    autoExtraction: true,
    injectEnabled: true,
    injectDepth: 4,
    memoriesPerContext: 5,
    similarityThreshold: 0.2,
    showScores: true,
    debug: false,
};

const state = {
    connected: false,
    page: 1,
    pageSize: 20,
    searchMode: false,
    processed: new Set(),
    queue: Promise.resolve(),
};

/* ------------------------------------------------------------------ helpers */

const getContext = () => SillyTavern.getContext();

function cfg() {
    const ctx = getContext();
    const store = (ctx.extensionSettings[MODULE] ??= {});
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (store[key] === undefined) store[key] = structuredClone(value);
    }
    return store;
}

const save = () => getContext().saveSettingsDebounced();

const log = (...args) => { if (cfg().debug) console.log('[DB Memory]', ...args); };

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(message, type = 'info') {
    if (typeof toastr === 'undefined') return;
    (toastr[type] ?? toastr.info)(message, 'DB Memory');
}

function currentCharacterId() {
    const ctx = getContext();
    if (ctx.groupId) return `group:${ctx.groupId}`;
    const character = ctx.characters?.[ctx.characterId];
    return character?.avatar || ctx.name2 || undefined;
}

/* --------------------------------------------------------------- HTTP / auth */

const baseUrl = () => cfg().backendUrl.trim().replace(/\/+$/, '');
const tokenExpired = () => !cfg().tokenExpiry || Date.now() >= new Date(cfg().tokenExpiry).getTime() - 60_000;

async function api(path, { method = 'GET', body, auth = true, retry = true, timeout = 15_000 } = {}) {
    const s = cfg();
    if (!baseUrl()) throw new Error('Backend URL is not set');

    if (auth && (!s.token || tokenExpired())) {
        await login();
    }

    const headers = { 'Content-Type': 'application/json' };
    if (auth && cfg().token) headers.Authorization = `Bearer ${cfg().token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
        const resp = await fetch(`${baseUrl()}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
        });

        if (resp.status === 401 && auth && retry) {
            await login();
            return api(path, { method, body, auth, retry: false, timeout });
        }

        if (resp.status === 204) return null;

        let data = null;
        try { data = await resp.json(); } catch { /* empty body */ }

        if (!resp.ok) {
            const err = new Error(data?.error || `HTTP ${resp.status}`);
            err.status = resp.status;
            throw err;
        }
        return data;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Request timed out');
        if (error instanceof TypeError) {
            throw new Error('Cannot reach backend (check URL, network, and http/https mixed content)');
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

function applyAuthResponse(data) {
    const s = cfg();
    s.token = data.token;
    try {
        const payload = JSON.parse(atob(data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        s.tokenExpiry = new Date(payload.exp * 1000).toISOString();
    } catch {
        s.tokenExpiry = new Date(Date.now() + 6 * 3600_000).toISOString();
    }
    setConnected(true);
    save();
}

async function login() {
    const s = cfg();
    if (!s.username || !s.password) throw new Error('Username and password are required');
    try {
        const data = await api('/api/auth/login', { method: 'POST', body: { username: s.username, password: s.password }, auth: false });
        applyAuthResponse(data);
    } catch (error) {
        setConnected(false);
        throw error;
    }
}

async function register() {
    const s = cfg();
    const data = await api('/api/auth/register', { method: 'POST', body: { username: s.username, password: s.password }, auth: false });
    applyAuthResponse(data);
}

function logout() {
    const s = cfg();
    s.token = null;
    s.tokenExpiry = null;
    s.password = '';
    setConnected(false);
    save();
}

/* ---------------------------------------------------------------------- UI */

const $q = (id) => $(`#dbm_${id}`);

function setConnected(value) {
    state.connected = value;
    const pill = $('#dbm_pill');
    pill.toggleClass('ok', value).toggleClass('err', !value);
    $('#dbm_pill_text').text(value ? 'Connected' : 'Disconnected');
}

function showMsg(text, type = 'info') {
    const el = $q('conn_msg');
    el.removeClass('ok err info').addClass(`show ${type}`).text(text);
}

function typeOptions(withAll) {
    const all = withAll ? '<option value="">All types</option>' : '';
    return all + MEMORY_TYPES.map((t) => `<option value="${t}">${t.replace(/_/g, ' ')}</option>`).join('');
}

function buildHtml() {
    return `
<div class="dbm-root inline-drawer" id="dbm_root">
  <div class="inline-drawer-toggle inline-drawer-header">
    <div class="dbm-title">
      <i class="fa-solid fa-brain"></i>
      <b>DB Memory</b>
      <span class="dbm-pill err" id="dbm_pill"><span class="dbm-dot"></span><span class="dbm-pill-text" id="dbm_pill_text">Disconnected</span></span>
    </div>
    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
  </div>

  <div class="inline-drawer-content">
    <div class="dbm-body">

      <div class="dbm-tabs">
        <div class="menu_button dbm-tab active" data-tab="conn"><i class="fa-solid fa-plug"></i><span class="dbm-tab-label">Connection</span></div>
        <div class="menu_button dbm-tab" data-tab="mem"><i class="fa-solid fa-database"></i><span class="dbm-tab-label">Memories</span></div>
        <div class="menu_button dbm-tab" data-tab="ctx"><i class="fa-solid fa-eye"></i><span class="dbm-tab-label">Context</span></div>
        <div class="menu_button dbm-tab" data-tab="set"><i class="fa-solid fa-sliders"></i><span class="dbm-tab-label">Settings</span></div>
      </div>

      <!-- Connection -->
      <div class="dbm-panel active" data-panel="conn">
        <div class="dbm-field">
          <label for="dbm_url">Backend URL</label>
          <input id="dbm_url" class="text_pole" type="text" placeholder="http://192.168.1.70:3000" autocomplete="off" autocapitalize="off" spellcheck="false">
        </div>
        <div class="dbm-grid">
          <div class="dbm-field">
            <label for="dbm_user">Username</label>
            <input id="dbm_user" class="text_pole" type="text" autocomplete="off" autocapitalize="off" spellcheck="false">
          </div>
          <div class="dbm-field">
            <label for="dbm_pass">Password</label>
            <input id="dbm_pass" class="text_pole" type="password" autocomplete="new-password">
          </div>
        </div>
        <div class="dbm-row">
          <div class="menu_button" id="dbm_connect"><i class="fa-solid fa-plug"></i> Connect</div>
          <div class="menu_button" id="dbm_register"><i class="fa-solid fa-user-plus"></i> Register</div>
          <div class="menu_button" id="dbm_test"><i class="fa-solid fa-heart-pulse"></i> Test</div>
          <div class="menu_button" id="dbm_disconnect"><i class="fa-solid fa-plug-circle-xmark"></i> Disconnect</div>
        </div>
        <div class="dbm-msg" id="dbm_conn_msg"></div>
        <div class="dbm-hint">Credentials are kept in SillyTavern's settings so the extension can reconnect automatically.</div>
      </div>

      <!-- Memories -->
      <div class="dbm-panel" data-panel="mem">
        <div class="dbm-row">
          <input id="dbm_search" class="text_pole flex1" type="text" placeholder="Semantic search…" autocomplete="off">
          <div class="menu_button" id="dbm_search_btn"><i class="fa-solid fa-magnifying-glass"></i></div>
          <div class="menu_button" id="dbm_refresh"><i class="fa-solid fa-rotate"></i></div>
        </div>
        <div class="dbm-grid">
          <div class="dbm-field">
            <label for="dbm_filter_type">Type</label>
            <select id="dbm_filter_type" class="text_pole">${typeOptions(true)}</select>
          </div>
          <div class="dbm-field">
            <label for="dbm_filter_scope">Scope</label>
            <select id="dbm_filter_scope" class="text_pole">
              <option value="all">All memories</option>
              <option value="character">Current character</option>
            </select>
          </div>
        </div>
        <div class="dbm-list" id="dbm_list"></div>
        <div class="dbm-pager" id="dbm_pager">
          <div class="menu_button" id="dbm_prev"><i class="fa-solid fa-chevron-left"></i> Prev</div>
          <span id="dbm_page_info">Page 1</span>
          <div class="menu_button" id="dbm_next">Next <i class="fa-solid fa-chevron-right"></i></div>
        </div>

        <hr class="dbm-sep">
        <div class="dbm-label"><b>Add memory manually</b></div>
        <div class="dbm-field">
          <textarea id="dbm_new_text" class="text_pole" placeholder="e.g. Alice prefers jasmine tea in the mornings."></textarea>
        </div>
        <div class="dbm-grid">
          <div class="dbm-field">
            <label for="dbm_new_type">Type</label>
            <select id="dbm_new_type" class="text_pole">${typeOptions(false)}</select>
          </div>
          <div class="dbm-field">
            <label for="dbm_new_importance">Importance</label>
            <div class="dbm-range">
              <input id="dbm_new_importance" type="range" min="0" max="1" step="0.05" value="0.5">
              <output id="dbm_new_importance_out">0.50</output>
            </div>
          </div>
        </div>
        <div class="dbm-row">
          <div class="menu_button" id="dbm_add"><i class="fa-solid fa-plus"></i> Add memory</div>
          <div class="menu_button" id="dbm_process_last"><i class="fa-solid fa-wand-magic-sparkles"></i> Extract from last message</div>
        </div>
      </div>

      <!-- Context preview -->
      <div class="dbm-panel" data-panel="ctx">
        <div class="dbm-hint">Shows which memories would be injected for the current chat's last message.</div>
        <div class="dbm-row">
          <div class="menu_button" id="dbm_ctx_refresh"><i class="fa-solid fa-rotate"></i> Refresh context</div>
        </div>
        <div class="dbm-list" id="dbm_ctx_list"></div>
        <pre class="dbm-pre" id="dbm_ctx_text" style="display:none"></pre>
      </div>

      <!-- Settings -->
      <div class="dbm-panel" data-panel="set">
        <label class="dbm-check"><input type="checkbox" id="dbm_s_autoSync"><span>Save chat messages to the database</span></label>
        <label class="dbm-check"><input type="checkbox" id="dbm_s_autoExtraction"><span>Extract memories from new messages</span></label>
        <label class="dbm-check"><input type="checkbox" id="dbm_s_injectEnabled"><span>Inject relevant memories into the prompt</span></label>
        <label class="dbm-check"><input type="checkbox" id="dbm_s_showScores"><span>Show relevance scores</span></label>
        <label class="dbm-check"><input type="checkbox" id="dbm_s_debug"><span>Debug logging (browser console)</span></label>

        <div class="dbm-grid">
          <div class="dbm-field">
            <label for="dbm_s_memoriesPerContext">Memories per prompt</label>
            <input id="dbm_s_memoriesPerContext" class="text_pole" type="number" min="1" max="20">
          </div>
          <div class="dbm-field">
            <label for="dbm_s_injectDepth">Injection depth (messages from end)</label>
            <input id="dbm_s_injectDepth" class="text_pole" type="number" min="0" max="50">
          </div>
        </div>
        <div class="dbm-field">
          <label for="dbm_s_similarityThreshold">Similarity threshold</label>
          <div class="dbm-range">
            <input id="dbm_s_similarityThreshold" type="range" min="0" max="1" step="0.01">
            <output id="dbm_s_similarityThreshold_out">0.20</output>
          </div>
        </div>
        <div class="dbm-row">
          <div class="menu_button" id="dbm_reset"><i class="fa-solid fa-rotate-left"></i> Reset to defaults</div>
        </div>
        <div class="dbm-hint">Changes are saved automatically.</div>
      </div>

    </div>
  </div>
</div>`;
}

/* ----------------------------------------------------------------- memories */

function memoryItem(m, score) {
    const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '';
    const scoreHtml = score !== undefined && cfg().showScores ? `<span>${(score * 100).toFixed(1)}%</span>` : '';
    const imp = typeof m.importance === 'number' ? `imp ${m.importance.toFixed(2)}` : '';
    const del = m.id ? `<div class="menu_button dbm-del" data-id="${esc(m.id)}" title="Delete"><i class="fa-solid fa-trash"></i></div>` : '';
    return `
<div class="dbm-item">
  <div class="dbm-item-head"><span class="dbm-badge">${esc((m.type || 'memory').replace(/_/g, ' '))}</span><span>${esc(imp)} ${scoreHtml}</span></div>
  <div class="dbm-item-text">${esc(m.content ?? m.memory)}</div>
  <div class="dbm-item-foot"><span>${esc(date)}</span>${del}</div>
</div>`;
}

function renderList(items, emptyText = 'No memories found') {
    $q('list').html(items.length ? items.join('') : `<div class="dbm-empty">${esc(emptyText)}</div>`);
}

function scopeCharacterId() {
    return $q('filter_scope').val() === 'character' ? currentCharacterId() : undefined;
}

async function loadMemories() {
    if (!state.connected) return renderList([], 'Not connected to backend');
    state.searchMode = false;
    $q('pager').show();

    const params = new URLSearchParams({ limit: String(state.pageSize), offset: String((state.page - 1) * state.pageSize) });
    const type = $q('filter_type').val();
    const characterId = scopeCharacterId();
    if (type) params.set('type', type);
    if (characterId) params.set('characterId', characterId);

    try {
        const data = await api(`/api/memories?${params}`);
        const memories = data.memories ?? [];
        renderList(memories.map((m) => memoryItem(m)));
        $q('page_info').text(`Page ${state.page}`);
        $q('prev').toggleClass('disabled', state.page <= 1);
        $q('next').toggleClass('disabled', memories.length < state.pageSize);
    } catch (error) {
        renderList([], `Failed to load: ${error.message}`);
    }
}

async function searchMemories() {
    const query = $q('search').val().trim();
    if (!query) { state.page = 1; return loadMemories(); }
    if (!state.connected) return renderList([], 'Not connected to backend');

    state.searchMode = true;
    $q('pager').hide();

    const body = { query, limit: 20, similarityThreshold: cfg().similarityThreshold };
    const type = $q('filter_type').val();
    const characterId = scopeCharacterId();
    if (type) body.types = [type];
    if (characterId) body.characterId = characterId;

    try {
        const data = await api('/api/search', { method: 'POST', body });
        renderList((data.results ?? []).map((m) => memoryItem(m, m.similarity)), 'No matches above the similarity threshold');
    } catch (error) {
        renderList([], `Search failed: ${error.message}`);
    }
}

async function addMemory() {
    const content = $q('new_text').val().trim();
    if (!content) return toast('Enter the memory text first', 'warning');
    if (!state.connected) return toast('Not connected', 'error');

    const body = {
        content,
        type: $q('new_type').val(),
        importance: Number($q('new_importance').val()),
        confidence: 0.9,
    };
    const characterId = currentCharacterId();
    if (characterId) body.characterId = characterId;

    try {
        const data = await api('/api/memories', { method: 'POST', body });
        toast(data.deduplicated ? 'Merged with an existing similar memory' : 'Memory added', 'success');
        $q('new_text').val('');
        state.page = 1;
        loadMemories();
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function deleteMemory(id) {
    if (!confirm('Delete this memory?')) return;
    try {
        await api(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
        state.searchMode ? searchMemories() : loadMemories();
    } catch (error) {
        toast(`Failed to delete: ${error.message}`, 'error');
    }
}

/* ------------------------------------------------------------------ context */

function lastChatText(chat) {
    const last = [...(chat ?? [])].reverse().find((m) => !m.is_system && (m.mes ?? '').trim());
    return last ? last.mes.trim().slice(0, 2000) : '';
}

async function fetchContextEntries(query, timeout = 15_000) {
    const s = cfg();
    const body = {
        query,
        memoryLimit: s.memoriesPerContext,
        messageLimit: 0,
        similarityThreshold: s.similarityThreshold,
        minRankScore: 0.2,
    };
    const characterId = currentCharacterId();
    if (characterId) body.characterId = characterId;
    const data = await api('/api/context', { method: 'POST', body, timeout });
    return data.entries ?? [];
}

function formatInjection(entries) {
    if (!entries.length) return '';
    const lines = entries.map((e) => `- (${e.type.replace(/_/g, ' ')}) ${e.memory}`);
    return `[Long-term memory — facts remembered from earlier]\n${lines.join('\n')}`;
}

async function previewContext() {
    if (!state.connected) return $q('ctx_list').html('<div class="dbm-empty">Not connected to backend</div>');
    const query = lastChatText(getContext().chat);
    if (!query) return $q('ctx_list').html('<div class="dbm-empty">No messages in the current chat</div>');

    try {
        const entries = await fetchContextEntries(query);
        $q('ctx_list').html(
            entries.length
                ? entries.map((e) => memoryItem({ type: e.type, importance: e.importance, content: e.memory }, e.relevance)).join('')
                : '<div class="dbm-empty">No relevant memories found</div>',
        );
        const text = formatInjection(entries);
        $q('ctx_text').text(text).toggle(Boolean(text));
    } catch (error) {
        $q('ctx_list').html(`<div class="dbm-empty">Failed: ${esc(error.message)}</div>`);
    }
}

/** Registered in manifest.json as "generate_interceptor". Runs before each generation. */
globalThis.dbMemoryIntercept = async function (chat, _contextSize, _abort, type) {
    const ctx = getContext();
    const s = cfg();
    // Always clear the previous injection first.
    ctx.setExtensionPrompt(PROMPT_KEY, '', 1, s.injectDepth, false, 0);

    if (!s.injectEnabled || !state.connected || type === 'quiet') return;

    try {
        const query = lastChatText(chat);
        if (!query) return;
        const entries = await fetchContextEntries(query, 8_000);
        const text = formatInjection(entries);
        if (text) ctx.setExtensionPrompt(PROMPT_KEY, text, 1 /* IN_CHAT */, s.injectDepth, false, 0 /* system */);
        log('Injected', entries.length, 'memories');
    } catch (error) {
        log('Injection skipped:', error.message);
    }
};

/* --------------------------------------------------------------- chat sync */

async function ensureBackendChat(forceNew = false) {
    const ctx = getContext();
    const key = ctx.chatId;
    if (!key) return null;
    const map = cfg().chatMap;
    if (map[key] && !forceNew) return map[key];

    const data = await api('/api/chats', { method: 'POST', body: { title: String(key).slice(0, 200) } });
    map[key] = data.chat.id;
    save();
    return map[key];
}

async function saveMessage(chatUuid, role, content) {
    return api('/api/messages', { method: 'POST', body: { chatId: chatUuid, role, content } });
}

async function syncMessage(index) {
    const s = cfg();
    if (!state.connected || (!s.autoSync && !s.autoExtraction)) return;

    const ctx = getContext();
    const message = ctx.chat?.[index];
    if (!message || message.is_system) return;

    const content = (message.mes ?? '').trim();
    if (!content) return;

    const key = `${ctx.chatId}:${index}:${content.length}:${content.slice(0, 40)}`;
    if (state.processed.has(key)) return;
    state.processed.add(key);

    const role = message.is_user ? 'user' : 'assistant';
    const characterId = currentCharacterId();

    let chatUuid = await ensureBackendChat();
    let sourceMessageId;

    if (s.autoSync) {
        try {
            sourceMessageId = (await saveMessage(chatUuid, role, content)).message.id;
        } catch (error) {
            if (error.status !== 404) throw error;
            chatUuid = await ensureBackendChat(true); // backend chat was deleted — recreate
            sourceMessageId = (await saveMessage(chatUuid, role, content)).message.id;
        }
    }

    if (s.autoExtraction) {
        const body = { content, role, chatId: chatUuid };
        if (characterId) body.characterId = characterId;
        if (sourceMessageId) body.sourceMessageId = sourceMessageId;
        const result = await api('/api/memories/process', { method: 'POST', body });
        log('Extracted', result.candidates, 'candidates →', result.created.length, 'new,', result.updated.length, 'merged');
    }
}

function enqueueSync(index) {
    state.queue = state.queue
        .then(() => syncMessage(index))
        .catch((error) => log('Sync failed:', error.message));
}

async function processLastMessage() {
    if (!state.connected) return toast('Not connected', 'error');
    const chat = getContext().chat ?? [];
    if (!chat.length) return toast('No messages in the current chat', 'warning');
    const last = chat[chat.length - 1];
    const content = (last.mes ?? '').trim();
    if (!content) return toast('Last message is empty', 'warning');

    try {
        const body = { content, role: last.is_user ? 'user' : 'assistant' };
        const characterId = currentCharacterId();
        if (characterId) body.characterId = characterId;
        const result = await api('/api/memories/process', { method: 'POST', body });
        toast(`${result.candidates} candidates · ${result.created.length} new · ${result.updated.length} merged`, 'success');
        loadMemories();
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ----------------------------------------------------------------- bindings */

const SETTING_FIELDS = [
    ['autoSync', 'checkbox'], ['autoExtraction', 'checkbox'], ['injectEnabled', 'checkbox'],
    ['showScores', 'checkbox'], ['debug', 'checkbox'],
    ['memoriesPerContext', 'int'], ['injectDepth', 'int'], ['similarityThreshold', 'float'],
];

function populate() {
    const s = cfg();
    $q('url').val(s.backendUrl);
    $q('user').val(s.username);
    $q('pass').val(s.password);
    for (const [key, kind] of SETTING_FIELDS) {
        const el = $(`#dbm_s_${key}`);
        if (kind === 'checkbox') el.prop('checked', Boolean(s[key]));
        else el.val(s[key]);
    }
    $('#dbm_s_similarityThreshold_out').text(Number(s.similarityThreshold).toFixed(2));
}

function readConnectionFields() {
    const s = cfg();
    s.backendUrl = $q('url').val().trim();
    s.username = $q('user').val().trim();
    s.password = $q('pass').val();
    save();
}

async function runConnection(action, label) {
    readConnectionFields();
    const s = cfg();
    if (!s.backendUrl || !s.username || !s.password) return showMsg('Fill in URL, username and password', 'err');
    showMsg(`${label}…`, 'info');
    try {
        await action();
        showMsg('Connected', 'ok');
        loadMemories();
    } catch (error) {
        showMsg(error.message, 'err');
    }
}

function bind() {
    const root = $('#dbm_root');

    root.on('click', '.dbm-tab', function () {
        const tab = $(this).data('tab');
        root.find('.dbm-tab').removeClass('active');
        $(this).addClass('active');
        root.find('.dbm-panel').removeClass('active').filter(`[data-panel="${tab}"]`).addClass('active');
        if (tab === 'mem') loadMemories();
        if (tab === 'ctx') previewContext();
    });

    // Connection
    $q('connect').on('click', () => runConnection(login, 'Connecting'));
    $q('register').on('click', () => runConnection(register, 'Registering'));
    $q('disconnect').on('click', () => { logout(); $q('pass').val(''); showMsg('Disconnected', 'info'); });
    $q('test').on('click', async () => {
        readConnectionFields();
        showMsg('Testing…', 'info');
        try {
            const health = await api('/health', { auth: false, timeout: 8_000 });
            showMsg(`Backend OK — pgvector ${health.pgvectorVersion ?? 'n/a'}, ${health.embeddingDimensions} dims (${health.embeddingProvider})`, 'ok');
        } catch (error) {
            showMsg(`Test failed: ${error.message}`, 'err');
        }
    });

    // Memories
    $q('refresh').on('click', () => { state.page = 1; $q('search').val(''); loadMemories(); });
    $q('search_btn').on('click', searchMemories);
    $q('search').on('keydown', (e) => { if (e.key === 'Enter') searchMemories(); });
    $q('filter_type').on('change', () => { state.page = 1; state.searchMode ? searchMemories() : loadMemories(); });
    $q('filter_scope').on('change', () => { state.page = 1; state.searchMode ? searchMemories() : loadMemories(); });
    $q('prev').on('click', () => { if (state.page > 1) { state.page--; loadMemories(); } });
    $q('next').on('click', function () { if (!$(this).hasClass('disabled')) { state.page++; loadMemories(); } });
    $q('list').on('click', '.dbm-del', function () { deleteMemory($(this).data('id')); });
    $q('add').on('click', addMemory);
    $q('process_last').on('click', processLastMessage);
    $q('new_importance').on('input', function () { $q('new_importance_out').text(Number(this.value).toFixed(2)); });

    // Context
    $q('ctx_refresh').on('click', previewContext);

    // Settings (auto-save)
    for (const [key, kind] of SETTING_FIELDS) {
        $(`#dbm_s_${key}`).on(kind === 'checkbox' ? 'change' : 'input change', function () {
            const s = cfg();
            if (kind === 'checkbox') s[key] = this.checked;
            else if (kind === 'int') s[key] = Math.max(0, parseInt(this.value, 10) || DEFAULTS[key]);
            else s[key] = parseFloat(this.value) || 0;
            if (key === 'similarityThreshold') $('#dbm_s_similarityThreshold_out').text(s[key].toFixed(2));
            save();
        });
    }

    $q('reset').on('click', () => {
        if (!confirm('Reset all DB Memory settings to defaults? (Connection details are kept.)')) return;
        const s = cfg();
        for (const [key] of SETTING_FIELDS) s[key] = DEFAULTS[key];
        populate();
        save();
        toast('Settings reset', 'info');
    });
}

/* --------------------------------------------------------------------- init */

async function autoConnect() {
    const s = cfg();
    if (!s.backendUrl) return;
    try {
        if (s.token && !tokenExpired()) {
            await api('/health', { auth: false, timeout: 6_000 });
            setConnected(true);
        } else if (s.username && s.password) {
            await login();
        }
    } catch (error) {
        log('Auto-connect failed:', error.message);
        setConnected(false);
    }
}

jQuery(async () => {
    const host = $('#extensions_settings2');
    if (!host.length) {
        console.error('[DB Memory] #extensions_settings2 not found');
        return;
    }

    host.append(buildHtml());
    populate();
    bind();
    setConnected(false);

    const ctx = getContext();
    const { eventSource, eventTypes } = ctx;
    eventSource.on(eventTypes.MESSAGE_SENT, enqueueSync);
    eventSource.on(eventTypes.MESSAGE_RECEIVED, enqueueSync);
    eventSource.on(eventTypes.CHAT_CHANGED, () => {
        state.processed.clear();
        state.page = 1;
    });

    await autoConnect();
    console.log('[DB Memory] Ready');
});