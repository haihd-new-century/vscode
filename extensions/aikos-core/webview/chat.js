// @ts-check
/** @typedef {import('../src/core/api-client').Citation} Citation */

(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // ─── DOM Refs ──────────────────────────────────────────────────────
  const messagesEl = /** @type {HTMLElement} */ (document.getElementById('messages'));
  const inputEl = /** @type {HTMLTextAreaElement} */ (document.getElementById('input'));
  const btnSend = /** @type {HTMLButtonElement} */ (document.getElementById('btn-send'));
  const btnStop = /** @type {HTMLButtonElement} */ (document.getElementById('btn-stop'));
  const btnNew = /** @type {HTMLButtonElement} */ (document.getElementById('btn-new'));
  const btnHistory = /** @type {HTMLButtonElement} */ (document.getElementById('btn-history'));
  const btnSettings = /** @type {HTMLButtonElement} */ (document.getElementById('btn-settings'));
  const collectionSelect = /** @type {HTMLSelectElement} */ (document.getElementById('collection-select'));
  const modelBadge = /** @type {HTMLElement} */ (document.getElementById('model-badge'));
  const charCount = /** @type {HTMLElement} */ (document.getElementById('char-count'));
  const welcomeEl = /** @type {HTMLElement} */ (document.getElementById('welcome'));

  // ─── State ─────────────────────────────────────────────────────────
  /** @type {{ role: string; content: string; thinking?: string; todos?: any[]; citations?: Citation[]; timestamp: number }[]} */
  let messages = [];
  let isStreaming = false;
  /** @type {HTMLElement | null} */
  let activeStreamEl = null;
  let streamBuffer = '';
  let thinkingBuffer = '';
  /** @type {Map<string, {id: string, title: string, status: string, progress?: number}>} */
  let activeTodos = new Map();

  // Restore persisted state
  const saved = vscode.getState();
  if (saved) {
    messages = saved.messages || [];
    renderAllMessages();
  }

  // ─── Event Listeners ──────────────────────────────────────────────
  btnSend.addEventListener('click', sendMessage);
  btnStop.addEventListener('click', () => vscode.postMessage({ type: 'stop' }));
  btnNew.addEventListener('click', () => {
    messages = [];
    renderAllMessages();
    persistState();
    vscode.postMessage({ type: 'newConversation' });
  });
  btnHistory.addEventListener('click', () => vscode.postMessage({ type: 'showHistory' }));
  btnSettings.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));

  collectionSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'selectCollection', collectionId: collectionSelect.value });
  });

  // Quick action buttons
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action) vscode.postMessage({ type: 'quickAction', action });
    });
  });

  // Input handling
  inputEl.addEventListener('input', () => {
    autoResize();
    charCount.textContent = inputEl.value.length > 0 ? `${inputEl.value.length}` : '';
    btnSend.disabled = inputEl.value.trim().length === 0;
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ─── Messages from Extension ──────────────────────────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'streamStart':
        startStream();
        break;
      case 'streamDelta':
        appendDelta(msg.content);
        break;
      case 'streamThinking':
        appendThinking(msg.content);
        break;
      case 'streamTodo':
        updateTodo(msg.todo);
        break;
      case 'streamSources':
        if (activeStreamEl) {
          renderCitations(activeStreamEl, msg.sources);
        }
        break;
      case 'streamDone':
        finishStream(msg.sources);
        break;
      case 'streamError':
        finishStream();
        showError(msg.error);
        break;
      case 'addMessage':
        addMessage(msg.role, msg.content, msg.citations);
        break;
      case 'setCollections':
        updateCollections(msg.collections, msg.selected);
        break;
      case 'setModel':
        modelBadge.textContent = msg.model || '';
        break;
      case 'clear':
        messages = [];
        renderAllMessages();
        persistState();
        break;
      case 'insertText':
        inputEl.value = msg.text;
        inputEl.focus();
        autoResize();
        btnSend.disabled = false;
        break;
    }
  });

  // ─── Core Functions ───────────────────────────────────────────────

  function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    addMessage('user', text);
    inputEl.value = '';
    autoResize();
    charCount.textContent = '';
    btnSend.disabled = true;

    vscode.postMessage({ type: 'chat', query: text });
  }

  /** @param {string} role @param {string} content @param {Citation[]} [citations] */
  function addMessage(role, content, citations) {
    messages.push({ role, content, citations, timestamp: Date.now() });
    renderMessage(messages[messages.length - 1], messages.length - 1);
    scrollToBottom();
    persistState();
    if (welcomeEl) welcomeEl.classList.add('hidden');
  }

  function startStream() {
    isStreaming = true;
    streamBuffer = '';
    thinkingBuffer = '';
    activeTodos = new Map();
    btnSend.classList.add('hidden');
    btnStop.classList.remove('hidden');

    // Create assistant message placeholder
    const idx = messages.length;
    messages.push({ role: 'assistant', content: '', thinking: '', todos: [], timestamp: Date.now() });
    activeStreamEl = renderMessage(messages[idx], idx);

    // Add streaming indicator
    const indicator = document.createElement('div');
    indicator.className = 'streaming-indicator';
    indicator.id = 'stream-dots';
    indicator.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    const body = activeStreamEl.querySelector('.message-body');
    if (body) body.appendChild(indicator);

    if (welcomeEl) welcomeEl.classList.add('hidden');
  }

  /** @param {string} content */
  function appendThinking(content) {
    thinkingBuffer += content;
    if (!activeStreamEl) return;

    let thinkingEl = activeStreamEl.querySelector('.thinking-panel');
    if (!thinkingEl) {
      // Create thinking panel above the message body
      thinkingEl = document.createElement('div');
      thinkingEl.className = 'thinking-panel';
      thinkingEl.innerHTML = `
        <div class="thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <span class="thinking-icon">💭</span>
          <span class="thinking-label">Thinking...</span>
          <span class="thinking-toggle codicon codicon-chevron-down"></span>
        </div>
        <div class="thinking-content"></div>
      `;
      const body = activeStreamEl.querySelector('.message-body');
      if (body) body.insertBefore(thinkingEl, body.firstChild);
    }

    const thinkingContent = thinkingEl.querySelector('.thinking-content');
    if (thinkingContent) {
      thinkingContent.innerHTML = renderMarkdown(thinkingBuffer);
    }
    scrollToBottom();
  }

  /** @param {{ id: string; action: string; title: string; status?: string; progress?: number }} todo */
  function updateTodo(todo) {
    if (!todo || !activeStreamEl) return;

    activeTodos.set(todo.id, todo);

    let todoPanel = activeStreamEl.querySelector('.todo-panel');
    if (!todoPanel) {
      todoPanel = document.createElement('div');
      todoPanel.className = 'todo-panel';
      todoPanel.innerHTML = `
        <div class="todo-header">
          <span class="todo-icon">📋</span>
          <span class="todo-label">Tasks</span>
        </div>
        <div class="todo-list"></div>
      `;
      const body = activeStreamEl.querySelector('.message-body');
      if (body) body.insertBefore(todoPanel, body.firstChild);
    }

    // Re-render all todos
    const todoList = todoPanel.querySelector('.todo-list');
    if (todoList) {
      todoList.innerHTML = '';
      for (const [, t] of activeTodos) {
        const item = document.createElement('div');
        item.className = `todo-item todo-${t.status || 'pending'}`;
        const icon = t.status === 'done' ? '✅' :
                     t.status === 'failed' ? '❌' :
                     t.status === 'in_progress' ? '🔄' : '⬜';
        const progressBar = t.progress != null
          ? `<div class="todo-progress"><div class="todo-progress-bar" style="width:${t.progress}%"></div></div>`
          : '';
        item.innerHTML = `<span class="todo-status-icon">${icon}</span><span class="todo-title">${escapeHtml(t.title)}</span>${progressBar}`;
        todoList.appendChild(item);
      }
    }

    // Update stored message
    if (messages.length > 0) {
      messages[messages.length - 1].todos = Array.from(activeTodos.values());
    }
    scrollToBottom();
  }

  /** @param {string} content */
  function appendDelta(content) {
    streamBuffer += content;
    if (activeStreamEl) {
      const body = activeStreamEl.querySelector('.message-body');
      if (body) {
        // Remove streaming dots if present
        const dots = body.querySelector('#stream-dots');
        // Update content (simple markdown rendering)
        const html = renderMarkdown(streamBuffer);
        if (dots) {
          body.innerHTML = html;
          body.appendChild(dots);
        } else {
          body.innerHTML = html;
        }
      }
    }
    // Update stored message
    if (messages.length > 0) {
      messages[messages.length - 1].content = streamBuffer;
    }
    scrollToBottom();
  }

  /** @param {Citation[]} [sources] */
  function finishStream(sources) {
    isStreaming = false;
    btnSend.classList.remove('hidden');
    btnStop.classList.add('hidden');

    // Remove streaming dots
    const dots = document.getElementById('stream-dots');
    if (dots) dots.remove();

    // Finalize thinking panel
    if (activeStreamEl && thinkingBuffer) {
      const thinkingEl = activeStreamEl.querySelector('.thinking-panel');
      if (thinkingEl) {
        const label = thinkingEl.querySelector('.thinking-label');
        if (label) label.textContent = 'Thinking (click to expand)';
        // Collapse thinking after streaming finishes
        thinkingEl.classList.add('collapsed');
      }
      if (messages.length > 0) {
        messages[messages.length - 1].thinking = thinkingBuffer;
      }
    }

    // Final render of content (preserve thinking and todo panels)
    if (activeStreamEl && streamBuffer) {
      const body = activeStreamEl.querySelector('.message-body');
      if (body) {
        const thinkingPanel = body.querySelector('.thinking-panel');
        const todoPanel = body.querySelector('.todo-panel');
        body.innerHTML = renderMarkdown(streamBuffer);
        // Re-insert panels before content
        if (todoPanel) body.insertBefore(todoPanel, body.firstChild);
        if (thinkingPanel) body.insertBefore(thinkingPanel, body.firstChild);
      }
    }

    // Add citations
    if (sources && sources.length > 0 && activeStreamEl) {
      renderCitations(activeStreamEl, sources);
      if (messages.length > 0) {
        messages[messages.length - 1].citations = sources;
      }
    }

    activeStreamEl = null;
    streamBuffer = '';
    thinkingBuffer = '';
    activeTodos = new Map();
    persistState();
    scrollToBottom();
  }

  /** @param {string} error */
  function showError(error) {
    const el = document.createElement('div');
    el.className = 'message-error';
    el.textContent = error;
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  // ─── Rendering ────────────────────────────────────────────────────

  function renderAllMessages() {
    // Keep welcome if no messages
    messagesEl.innerHTML = '';
    if (messages.length === 0 && welcomeEl) {
      messagesEl.appendChild(welcomeEl);
      welcomeEl.classList.remove('hidden');
      return;
    }
    messages.forEach((msg, i) => renderMessage(msg, i));
  }

  /**
   * @param {{ role: string; content: string; thinking?: string; todos?: any[]; citations?: Citation[]; timestamp: number }} msg
   * @param {number} _index
   * @returns {HTMLElement}
   */
  function renderMessage(msg, _index) {
    const el = document.createElement('div');
    el.className = `message ${msg.role}`;

    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Build body content
    let bodyHtml = msg.role === 'user' ? escapeHtml(msg.content) : renderMarkdown(msg.content);

    // Prepend thinking panel if present (collapsed by default for restored messages)
    let thinkingHtml = '';
    if (msg.thinking) {
      thinkingHtml = `
        <div class="thinking-panel collapsed">
          <div class="thinking-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span class="thinking-icon">💭</span>
            <span class="thinking-label">Thinking (click to expand)</span>
            <span class="thinking-toggle codicon codicon-chevron-down"></span>
          </div>
          <div class="thinking-content">${renderMarkdown(msg.thinking)}</div>
        </div>
      `;
    }

    // Prepend todo panel if present
    let todoHtml = '';
    if (msg.todos && msg.todos.length > 0) {
      const todoItems = msg.todos.map(t => {
        const icon = t.status === 'done' ? '✅' :
                     t.status === 'failed' ? '❌' :
                     t.status === 'in_progress' ? '🔄' : '⬜';
        const progressBar = t.progress != null
          ? `<div class="todo-progress"><div class="todo-progress-bar" style="width:${t.progress}%"></div></div>`
          : '';
        return `<div class="todo-item todo-${t.status || 'pending'}"><span class="todo-status-icon">${icon}</span><span class="todo-title">${escapeHtml(t.title)}</span>${progressBar}</div>`;
      }).join('');
      todoHtml = `
        <div class="todo-panel">
          <div class="todo-header"><span class="todo-icon">📋</span><span class="todo-label">Tasks</span></div>
          <div class="todo-list">${todoItems}</div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="message-header">
        <span class="message-role ${msg.role}">${msg.role === 'user' ? 'You' : 'AIKOS'}</span>
        <span class="message-time">${time}</span>
      </div>
      <div class="message-body">${thinkingHtml}${todoHtml}${bodyHtml}</div>
    `;

    if (msg.citations && msg.citations.length > 0) {
      renderCitations(el, msg.citations);
    }

    messagesEl.appendChild(el);
    return el;
  }

  /**
   * @param {HTMLElement} container
   * @param {Citation[]} citations
   */
  function renderCitations(container, citations) {
    // Remove existing citations section
    const existing = container.querySelector('.citations');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.className = 'citations';
    section.innerHTML = `<div class="citations-title">Sources (${citations.length})</div>`;

    for (const c of citations) {
      const cite = document.createElement('div');
      cite.className = 'citation';
      cite.innerHTML = `
        <span class="citation-index">${c.index}</span>
        <span class="citation-text">
          <span class="citation-doc">${escapeHtml(c.document_name || 'Unknown')}</span>
          ${c.page_number ? ` · p.${c.page_number}` : ''}
          — ${escapeHtml(c.content.slice(0, 120))}${c.content.length > 120 ? '...' : ''}
        </span>
        <span class="citation-score">${(c.score * 100).toFixed(0)}%</span>
      `;
      cite.addEventListener('click', () => {
        vscode.postMessage({ type: 'openCitation', citation: c });
      });
      section.appendChild(cite);
    }

    container.appendChild(section);
  }

  /**
   * @param {Array<{id: string; name: string}>} collections
   * @param {string} [selected]
   */
  function updateCollections(collections, selected) {
    collectionSelect.innerHTML = '<option value="">None (general)</option>';
    for (const c of collections) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === selected) opt.selected = true;
      collectionSelect.appendChild(opt);
    }
  }

  // ─── Markdown Rendering (lightweight) ─────────────────────────────

  /** @param {string} text @returns {string} */
  function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
      return `<pre><code class="language-${lang}">${code}</code><button class="code-copy-btn" onclick="copyCode(this)">Copy</button></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Unordered lists
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    // Clean up nested ul
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/<\/blockquote>\s*<blockquote>/g, '\n');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" title="$1">$1</a>');

    // Paragraphs (double newline)
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;
    html = html.replace(/<p><\/p>/g, '');

    // Single newlines → <br> (only inside <p>)
    html = html.replace(/<p>([\s\S]*?)<\/p>/g, (_match, inner) => {
      return `<p>${inner.replace(/\n/g, '<br>')}</p>`;
    });

    return html;
  }

  /** @param {string} str @returns {string} */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ─── Utilities ────────────────────────────────────────────────────

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function persistState() {
    vscode.setState({ messages });
  }

  // Global copy function for code blocks
  // @ts-ignore
  window.copyCode = function (btn) {
    const code = btn.previousElementSibling;
    if (code) {
      navigator.clipboard.writeText(code.textContent || '');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    }
  };

  // Focus input on load
  inputEl.focus();
  btnSend.disabled = true;
})();
