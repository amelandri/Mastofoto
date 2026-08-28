(() => {
  'use strict';

  const APP_VERSION = '0.3.1';
  const REDIRECT_URI = window.location.origin + window.location.pathname;
  const SCOPES = 'read write:favourites write:statuses';
  const APP_NAME = 'Mastofoto';
  const PENDING_INSTANCE_KEY = 'mastofoto:pendingInstance';
  const PENDING_STATE_KEY = 'mastofoto:pendingState';

  // ---------- storage helpers ----------

  function storageKey(instance, name) {
    return `mastofoto:${instance}:${name}`;
  }

  function saveInstanceData(instance, data) {
    Object.entries(data).forEach(([k, v]) => {
      localStorage.setItem(storageKey(instance, k), v);
    });
  }

  function getInstanceData(instance, name) {
    return localStorage.getItem(storageKey(instance, name));
  }

  function clearInstanceData(instance) {
    ['clientId', 'clientSecret', 'accessToken'].forEach(k => {
      localStorage.removeItem(storageKey(instance, k));
    });
    localStorage.removeItem('mastofoto:lastInstance');
  }

  function normalizeInstance(raw) {
    return raw.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  // ---------- API helpers ----------

  async function registerApp(instance) {
    const res = await fetch(`https://${instance}/api/v1/apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: APP_NAME,
        redirect_uris: REDIRECT_URI,
        scopes: SCOPES,
      }),
    });
    if (!res.ok) throw new Error(`App registration failed (${res.status})`);
    return res.json();
  }

  async function exchangeCodeForToken(instance, clientId, clientSecret, code) {
    const res = await fetch(`https://${instance}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code: code,
        scope: SCOPES,
      }),
    });
    if (!res.ok) throw new Error(`Code exchange failed (${res.status})`);
    return res.json();
  }

  async function apiFetch(instance, token, path, options = {}) {
    const res = await fetch(`https://${instance}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) throw new Error(`API request failed: ${path} (${res.status})`);
    return res;
  }

  function parseNextMaxId(linkHeader, statuses) {
    if (linkHeader) {
      const match = linkHeader.split(',').find(part => part.includes('rel="next"'));
      if (match) {
        const urlMatch = match.match(/<([^>]+)>/);
        if (urlMatch) {
          const url = new URL(urlMatch[1]);
          const maxId = url.searchParams.get('max_id');
          if (maxId) return maxId;
        }
      }
    }
    if (statuses.length) return statuses[statuses.length - 1].id;
    return null;
  }

  // ---------- sanitizer ----------

  const ALLOWED_TAGS = new Set(['A', 'P', 'BR', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'DEL', 'CODE', 'PRE', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);

  function isHttpUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function sanitizeStatusHtml(html) {
    const doc = new DOMParser().parseFromString(html || '', 'text/html');
    const walk = (node) => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (!ALLOWED_TAGS.has(child.tagName)) {
            const text = document.createTextNode(child.textContent);
            node.replaceChild(text, child);
            return;
          }
          const isHashtag = child.tagName === 'A' &&
            (/(^|\s)hashtag(\s|$)/.test(child.getAttribute('class') || '') || child.getAttribute('rel') === 'tag');

          [...child.attributes].forEach(attr => {
            if (child.tagName === 'A' && attr.name === 'href') {
              if (!isHttpUrl(attr.value)) child.removeAttribute('href');
              return;
            }
            child.removeAttribute(attr.name);
          });
          if (child.tagName === 'A') {
            child.setAttribute('rel', 'noopener noreferrer');
            child.setAttribute('target', '_blank');
            if (isHashtag) child.classList.add('tag-link');
          }
          walk(child);
        } else if (child.nodeType !== Node.TEXT_NODE) {
          node.removeChild(child);
        }
      });
    };
    walk(doc.body);
    return doc.body.innerHTML;
  }

  // ---------- app state ----------

  const state = {
    instance: null,
    token: null,
    currentListId: null,
    nextMaxId: null,
    lastSeenBefore: null,
  };

  function lastSeenKey(listId) {
    return `lastSeen:${listId}`;
  }

  function formatStatusDate(dateStr) {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function hasPhoto(status) {
    const original = status.reblog || status;
    return (original.media_attachments || []).some(att => att.type === 'image');
  }

  // ---------- DOM refs ----------

  const el = {
    instanceInput: document.getElementById('instance-input'),
    connectBtn: document.getElementById('connect-btn'),
    loginError: document.getElementById('login-error'),
    loginView: document.getElementById('login-view'),
    timelineView: document.getElementById('timeline-view'),
    sessionInfo: document.getElementById('session-info'),
    currentInstance: document.getElementById('current-instance'),
    logoutBtn: document.getElementById('logout-btn'),
    changeListBtn: document.getElementById('change-list-btn'),
    statuses: document.getElementById('statuses'),
    timelineError: document.getElementById('timeline-error'),
    loadMoreBtn: document.getElementById('load-more-btn'),
    listSetupView: document.getElementById('list-setup-view'),
    listSelect: document.getElementById('list-select'),
    useListBtn: document.getElementById('use-list-btn'),
    listSetupError: document.getElementById('list-setup-error'),
    noListMessage: document.getElementById('no-list-message'),
    listMembersHeading: document.getElementById('list-members-heading'),
    listMembers: document.getElementById('list-members'),
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightbox-img'),
    infoBtn: document.getElementById('info-btn'),
    infoView: document.getElementById('info-view'),
    appVersion: document.getElementById('app-version'),
  };

  el.appVersion.textContent = APP_VERSION;

  // ---------- lightbox ----------

  function openLightbox(src, alt) {
    el.lightboxImg.src = src;
    el.lightboxImg.alt = alt || '';
    show(el.lightbox);
  }

  function closeLightbox() {
    hide(el.lightbox);
    el.lightboxImg.src = '';
  }

  el.lightbox.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  // ---------- info page ----------

  el.infoBtn.addEventListener('click', () => {
    hide(el.timelineView);
    hide(el.listSetupView);
    show(el.infoView);
  });

  // ---------- login flow ----------

  el.connectBtn.addEventListener('click', async () => {
    hide(el.loginError);
    const instance = normalizeInstance(el.instanceInput.value);
    if (!instance) {
      showError(el.loginError, 'Enter an instance domain.');
      return;
    }
    try {
      const existingToken = getInstanceData(instance, 'accessToken');
      if (existingToken) {
        await startSession(instance, existingToken);
        return;
      }
      const app = await registerApp(instance);
      saveInstanceData(instance, { clientId: app.client_id, clientSecret: app.client_secret });
      const csrfState = crypto.randomUUID();
      localStorage.setItem(PENDING_INSTANCE_KEY, instance);
      localStorage.setItem(PENDING_STATE_KEY, csrfState);

      const authorizeUrl = `https://${instance}/oauth/authorize?client_id=${encodeURIComponent(app.client_id)}` +
        `&scope=${encodeURIComponent(SCOPES)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&state=${encodeURIComponent(csrfState)}`;
      window.location.href = authorizeUrl;
    } catch (err) {
      showError(el.loginError, err.message);
    }
  });

  async function completeAuthorization(code, returnedState) {
    const instance = localStorage.getItem(PENDING_INSTANCE_KEY);
    const expectedState = localStorage.getItem(PENDING_STATE_KEY);
    localStorage.removeItem(PENDING_INSTANCE_KEY);
    localStorage.removeItem(PENDING_STATE_KEY);

    if (!instance || !expectedState || returnedState !== expectedState) {
      throw new Error('OAuth response security check failed. Please try logging in again.');
    }

    const clientId = getInstanceData(instance, 'clientId');
    const clientSecret = getInstanceData(instance, 'clientSecret');
    if (!clientId || !clientSecret) return false;

    el.instanceInput.value = instance;
    const tokenData = await exchangeCodeForToken(instance, clientId, clientSecret, code);
    saveInstanceData(instance, { accessToken: tokenData.access_token });
    await startSession(instance, tokenData.access_token);
    return true;
  }

  el.logoutBtn.addEventListener('click', () => {
    if (state.instance) clearInstanceData(state.instance);
    state.instance = null;
    state.token = null;
    state.currentListId = null;
    hide(el.timelineView);
    hide(el.listSetupView);
    hide(el.sessionInfo);
    show(el.loginView);
    el.instanceInput.value = '';
    el.currentInstance.textContent = '';
  });

  el.changeListBtn.addEventListener('click', () => {
    hide(el.timelineView);
    showListSetup(getInstanceData(state.instance, 'listId'));
  });

  el.useListBtn.addEventListener('click', async () => {
    const listId = el.listSelect.value;
    if (!listId) return;
    saveInstanceData(state.instance, { listId });
    hide(el.listSetupView);
    show(el.timelineView);
    await selectList(listId);
  });

  el.listSelect.addEventListener('change', () => {
    if (el.listSelect.value) loadListMembers(el.listSelect.value);
  });

  async function loadListMembers(listId) {
    el.listMembers.innerHTML = '';
    hide(el.listMembersHeading);
    try {
      const res = await apiFetch(state.instance, state.token, `/api/v1/lists/${listId}/accounts?limit=80`);
      const accounts = await res.json();
      accounts.sort((a, b) =>
        (a.display_name || a.username).localeCompare(b.display_name || b.username, undefined, { sensitivity: 'base' })
      );

      show(el.listMembersHeading);
      accounts.forEach(account => {
        const item = document.createElement('li');
        const name = escapeHtml(account.display_name || account.username);
        item.innerHTML = `
          <img src="${escapeAttr(account.avatar)}" alt="">
          ${account.url && isHttpUrl(account.url)
            ? `<a class="member-name" href="${escapeAttr(account.url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
            : `<span class="member-name">${name}</span>`}
          <span class="member-handle">@${escapeHtml(account.acct)}</span>
        `;
        el.listMembers.appendChild(item);
      });
    } catch (err) {
      showError(el.listSetupError, err.message);
    }
  }

  async function startSession(instance, token) {
    // verify token is still valid
    await apiFetch(instance, token, '/api/v1/accounts/verify_credentials');
    state.instance = instance;
    state.token = token;
    localStorage.setItem('mastofoto:lastInstance', instance);

    hide(el.loginView);
    show(el.sessionInfo);
    el.currentInstance.textContent = instance;

    const configuredListId = getInstanceData(instance, 'listId');
    if (configuredListId) {
      show(el.timelineView);
      await selectList(configuredListId);
    } else {
      await showListSetup(null);
    }
  }

  // ---------- list configuration ----------

  async function showListSetup(preselectListId) {
    hide(el.listSetupError);
    hide(el.noListMessage);
    hide(el.listMembersHeading);
    el.listSelect.innerHTML = '';
    el.listMembers.innerHTML = '';
    show(el.listSetupView);

    try {
      const res = await apiFetch(state.instance, state.token, '/api/v1/lists');
      const lists = await res.json();

      if (!lists.length) {
        show(el.noListMessage);
        el.listSelect.classList.add('hidden');
        el.useListBtn.classList.add('hidden');
        return;
      }
      el.listSelect.classList.remove('hidden');
      el.useListBtn.classList.remove('hidden');

      lists.forEach(list => {
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = list.title;
        if (preselectListId && String(preselectListId) === String(list.id)) option.selected = true;
        el.listSelect.appendChild(option);
      });

      if (el.listSelect.value) await loadListMembers(el.listSelect.value);
    } catch (err) {
      showError(el.listSetupError, err.message);
    }
  }

  async function selectList(listId) {
    state.currentListId = listId;
    state.nextMaxId = null;
    el.statuses.innerHTML = '';
    hide(el.timelineError);

    await loadTimeline(false);
  }

  el.loadMoreBtn.addEventListener('click', () => loadTimeline(true));

  async function loadTimeline(append) {
    try {
      const path = `/api/v1/timelines/list/${state.currentListId}`;
      const params = new URLSearchParams({ limit: '20' });
      if (append && state.nextMaxId) params.set('max_id', state.nextMaxId);

      const res = await apiFetch(state.instance, state.token, `${path}?${params.toString()}`);
      const statuses = await res.json();
      state.nextMaxId = parseNextMaxId(res.headers.get('Link'), statuses);
      el.loadMoreBtn.classList.toggle('hidden', statuses.length === 0);

      const photoStatuses = statuses.filter(hasPhoto);

      if (!append) {
        state.lastSeenBefore = getInstanceData(state.instance, lastSeenKey(state.currentListId));
        if (photoStatuses.length) {
          saveInstanceData(state.instance, { [lastSeenKey(state.currentListId)]: photoStatuses[0].created_at });
        }
      }

      renderStatuses(photoStatuses, append);
    } catch (err) {
      showError(el.timelineError, err.message);
    }
  }

  // ---------- rendering ----------

  function renderStatuses(statuses, append) {
    if (!append) el.statuses.innerHTML = '';
    statuses.forEach(status => {
      el.statuses.appendChild(renderStatusCard(status));
    });
  }

  function buildMediaElement(original) {
    if (!original.media_attachments || !original.media_attachments.length) return null;
    const media = document.createElement('div');
    media.className = 'status-media';
    original.media_attachments.forEach(att => {
      if (att.type === 'image') {
        const img = document.createElement('img');
        const fullSrc = att.url || att.preview_url;
        img.src = fullSrc;
        img.alt = att.description || '';
        img.loading = 'lazy';
        img.addEventListener('click', () => openLightbox(fullSrc, att.description));
        media.appendChild(img);
      } else if (att.type === 'video' || att.type === 'gifv') {
        const video = document.createElement('video');
        video.src = att.url;
        video.controls = true;
        media.appendChild(video);
      }
    });
    return media;
  }

  function renderStatusCard(status) {
    const isReblog = !!status.reblog;
    const original = isReblog ? status.reblog : status;
    const isNew = !!state.lastSeenBefore && new Date(status.created_at) > new Date(state.lastSeenBefore);

    const card = document.createElement('div');
    card.className = isNew ? 'status-card is-new' : 'status-card';

    if (isReblog) {
      const banner = document.createElement('div');
      banner.className = 'reblog-banner';
      banner.textContent = `🔁 ${status.account.display_name || status.account.username} boosted`;
      card.appendChild(banner);
    }

    const header = document.createElement('div');
    header.className = 'status-header';
    header.innerHTML = `
      <a href="${escapeAttr(original.account.url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeAttr(original.account.avatar)}" alt=""></a>
      <div class="status-author">
        <div class="display-name"><a href="${escapeAttr(original.account.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(original.account.display_name || original.account.username)}</a></div>
        ${original.account.url && isHttpUrl(original.account.url)
          ? `<a class="username" href="${escapeAttr(original.account.url)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(original.account.acct)}</a>`
          : `<div class="username">@${escapeHtml(original.account.acct)}</div>`}
      </div>
      
      <div class="status-date">${isNew ? '<span class="new-badge">New</span>' : ''} ${escapeHtml(formatStatusDate(original.created_at))}</div>
    `;
    card.appendChild(header);

    const media = buildMediaElement(original);

    if (original.spoiler_text) {
      const cw = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = original.spoiler_text;
      cw.appendChild(summary);
      if (media) cw.appendChild(media);
      const content = document.createElement('div');
      content.className = 'status-content';
      content.innerHTML = sanitizeStatusHtml(original.content);
      cw.appendChild(content);
      card.appendChild(cw);
    } else {
      if (media) card.appendChild(media);
      const content = document.createElement('div');
      content.className = 'status-content';
      content.innerHTML = sanitizeStatusHtml(original.content);
      card.appendChild(content);
    }

    const actions = document.createElement('div');
    actions.className = 'status-actions';

    const favBtn = document.createElement('button');
    favBtn.textContent = `⭐ ${original.favourites_count}`;
    if (original.favourited) favBtn.classList.add('active');
    favBtn.addEventListener('click', () => toggleFavourite(original.id, favBtn));
    actions.appendChild(favBtn);

    const boostBtn = document.createElement('button');
    boostBtn.textContent = `🔁 ${original.reblogs_count}`;
    if (original.reblogged) boostBtn.classList.add('active');
    if (original.visibility === 'private' || original.visibility === 'direct') {
      boostBtn.disabled = true;
    }
    boostBtn.addEventListener('click', () => toggleReblog(original.id, boostBtn));
    actions.appendChild(boostBtn);

    if (original.url && isHttpUrl(original.url)) {
      const originalLink = document.createElement('a');
      originalLink.className = 'view-original-btn';
      originalLink.href = original.url;
      originalLink.target = '_blank';
      originalLink.rel = 'noopener noreferrer';
      originalLink.textContent = '🔗 View post';
      actions.appendChild(originalLink);
    }

    card.appendChild(actions);
    return card;
  }

  async function toggleFavourite(statusId, btn) {
    const isActive = btn.classList.contains('active');
    const action = isActive ? 'unfavourite' : 'favourite';
    try {
      const res = await apiFetch(state.instance, state.token, `/api/v1/statuses/${statusId}/${action}`, { method: 'POST' });
      const updated = await res.json();
      btn.textContent = `⭐ ${updated.favourites_count}`;
      btn.classList.toggle('active', !isActive);
    } catch (err) {
      showError(el.timelineError, err.message);
    }
  }

  async function toggleReblog(statusId, btn) {
    const isActive = btn.classList.contains('active');
    const action = isActive ? 'unreblog' : 'reblog';
    try {
      const res = await apiFetch(state.instance, state.token, `/api/v1/statuses/${statusId}/${action}`, { method: 'POST' });
      const updated = await res.json();
      const target = isActive ? updated : updated.reblog || updated;
      btn.textContent = `🔁 ${target.reblogs_count}`;
      btn.classList.toggle('active', !isActive);
    } catch (err) {
      showError(el.timelineError, err.message);
    }
  }

  // ---------- utils ----------

  function show(elem) { elem.classList.remove('hidden'); }
  function hide(elem) { elem.classList.add('hidden'); }
  function showError(elem, msg) { elem.textContent = msg; show(elem); }
  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str); }

  // ---------- bootstrap ----------

  (async function init() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnedState = params.get('state');
    const authError = params.get('error');

    if (code || authError) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (authError) {
      showError(el.loginError, `Authorization denied by the instance (${authError}).`);
      return;
    }

    if (code) {
      try {
        const handled = await completeAuthorization(code, returnedState);
        if (handled) return;
      } catch (err) {
        showError(el.loginError, err.message);
        return;
      }
    }

    const lastInstance = localStorage.getItem('mastofoto:lastInstance');
    if (lastInstance) {
      const token = getInstanceData(lastInstance, 'accessToken');
      if (token) {
        el.instanceInput.value = lastInstance;
        try {
          await startSession(lastInstance, token);
        } catch (err) {
          clearInstanceData(lastInstance);
        }
      }
    }
  })();
})();
