import { isHttpUrl, hasPhoto, parseNextMaxId } from './pure.mjs';

(() => {
  'use strict';

  const APP_VERSION = '0.5.0';
  const REDIRECT_URI = window.location.origin + window.location.pathname;
  const SCOPES = 'read write:favourites write:statuses';
  const APP_NAME = 'Mastofoto';
  const PENDING_INSTANCE_KEY = 'mastofoto:pendingInstance';
  const PENDING_STATE_KEY = 'mastofoto:pendingState';
  const THEME_KEY = 'mastofoto:theme';

  // ---------- theme ----------

  function getPreferredTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.content = theme === 'dark' ? '#191d20' : '#f2f3f5';
  }

  applyTheme(getPreferredTheme());

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

  // ---------- sanitizer ----------

  const ALLOWED_TAGS = new Set(['A', 'P', 'BR', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'DEL', 'CODE', 'PRE', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);

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


  // ---------- DOM refs ----------

  const el = {
    instanceInput: document.getElementById('instance-input'),
    connectBtn: document.getElementById('connect-btn'),
    loginError: document.getElementById('login-error'),
    loginView: document.getElementById('login-view'),
    timelineView: document.getElementById('timeline-view'),
    currentInstance: document.getElementById('current-instance'),
    logoutBtn: document.getElementById('logout-btn'),
    changeListBtn: document.getElementById('change-list-btn'),
    statuses: document.getElementById('statuses'),
    timelineError: document.getElementById('timeline-error'),
    loadMoreBtn: document.getElementById('load-more-btn'),
    listSetupView: document.getElementById('list-setup-view'),
    listSelect: document.getElementById('list-select'),
    useListBtn: document.getElementById('use-list-btn'),
    themeSelect: document.getElementById('theme-select'),
    listSetupError: document.getElementById('list-setup-error'),
    noListMessage: document.getElementById('no-list-message'),
    listMembersHeading: document.getElementById('list-members-heading'),
    listMembers: document.getElementById('list-members'),
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightbox-img'),
    infoBtn: document.getElementById('info-btn'),
    infoView: document.getElementById('info-view'),
    loginInfoBtn: document.getElementById('login-info-btn'),
    appVersion: document.getElementById('app-version'),
    pullRefresh: document.getElementById('pull-refresh'),
    pullRefreshLabel: document.getElementById('pull-refresh-label'),
    lightboxClose: document.getElementById('lightbox-close'),
  };

  // ---------- view switching ----------
  // Exactly one of these four <section>s is ever visible at a time; showView()
  // is the single place that enforces that, so a handler can never forget to
  // hide a view it's navigating away from (see CHANGELOG for the logout bug
  // this replaced).

  const VIEWS = [el.loginView, el.listSetupView, el.timelineView, el.infoView];

  function showView(view) {
    VIEWS.forEach(hide);
    show(view);
  }

  el.appVersion.textContent = APP_VERSION;

  el.themeSelect.value = getPreferredTheme();
  el.themeSelect.addEventListener('change', () => {
    const theme = el.themeSelect.value;
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  });

  // ---------- lightbox ----------

  let lightboxTrigger = null;

  function openLightbox(src, alt, triggerEl) {
    el.lightboxImg.src = src;
    el.lightboxImg.alt = alt || 'Photo without a description';
    lightboxTrigger = triggerEl || document.activeElement;
    show(el.lightbox);
    el.lightboxClose.focus();
  }

  function closeLightbox() {
    hide(el.lightbox);
    el.lightboxImg.src = '';
    if (lightboxTrigger) lightboxTrigger.focus();
    lightboxTrigger = null;
  }

  el.lightbox.addEventListener('click', closeLightbox);
  el.lightboxClose.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  // ---------- pull to refresh ----------

  const PULL_THRESHOLD = 70;
  const PULL_MAX = 100;
  let pullStartY = null;
  let pulling = false;
  let refreshing = false;

  function setPullHeight(px) {
    el.pullRefresh.style.height = `${px}px`;
  }

  document.addEventListener('touchstart', (e) => {
    if (refreshing || el.timelineView.classList.contains('hidden')) return;
    if (window.scrollY > 0) return;
    pullStartY = e.touches[0].clientY;
    pulling = true;
    el.pullRefresh.classList.add('pulling');
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling || pullStartY === null) return;
    const delta = e.touches[0].clientY - pullStartY;
    if (delta <= 0 || window.scrollY > 0) {
      pulling = false;
      setPullHeight(0);
      el.pullRefresh.classList.remove('pulling', 'ready');
      return;
    }
    e.preventDefault();
    const height = Math.min(delta * 0.5, PULL_MAX);
    setPullHeight(height);
    el.pullRefresh.classList.toggle('ready', height >= PULL_THRESHOLD);
    el.pullRefreshLabel.textContent = height >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh';
  }, { passive: false });

  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    const height = parseFloat(el.pullRefresh.style.height) || 0;
    pulling = false;
    pullStartY = null;
    el.pullRefresh.classList.remove('pulling');

    if (height >= PULL_THRESHOLD) {
      refreshing = true;
      el.pullRefreshLabel.textContent = 'Refreshing…';
      setPullHeight(50);
      try {
        await loadTimeline(false);
      } finally {
        setPullHeight(0);
        el.pullRefresh.classList.remove('ready');
        el.pullRefreshLabel.textContent = 'Pull to refresh';
        refreshing = false;
      }
    } else {
      setPullHeight(0);
      el.pullRefresh.classList.remove('ready');
    }
  });

  // ---------- info page ----------

  el.infoBtn.addEventListener('click', () => showView(el.infoView));
  el.loginInfoBtn.addEventListener('click', () => showView(el.infoView));

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
    hide(el.changeListBtn);
    hide(el.logoutBtn);
    showView(el.loginView);
    el.instanceInput.value = '';
    el.currentInstance.textContent = '';
  });

  el.changeListBtn.addEventListener('click', () => {
    showListSetup(getInstanceData(state.instance, 'listId'));
  });

  el.useListBtn.addEventListener('click', async () => {
    const listId = el.listSelect.value;
    if (!listId) return;
    saveInstanceData(state.instance, { listId });
    showView(el.timelineView);
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

    show(el.changeListBtn);
    show(el.logoutBtn);
    el.currentInstance.textContent = instance;

    const configuredListId = getInstanceData(instance, 'listId');
    if (configuredListId) {
      showView(el.timelineView);
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
    showView(el.listSetupView);

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

  // ---------- blurhash ----------
  // Reimplementation of the public blurhash decode algorithm (https://blurha.sh) —
  // no external library, to keep the app free of runtime dependencies.

  const BLURHASH_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

  function decode83(str) {
    let value = 0;
    for (let i = 0; i < str.length; i++) {
      value = value * 83 + BLURHASH_DIGITS.indexOf(str[i]);
    }
    return value;
  }

  function sRGBToLinear(value) {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }

  function linearToSRGB(value) {
    const v = Math.max(0, Math.min(1, value));
    return v <= 0.0031308
      ? Math.round(v * 12.92 * 255)
      : Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
  }

  function signPow(value, exp) {
    return Math.sign(value) * Math.pow(Math.abs(value), exp);
  }

  function decodeBlurhash(hash, width, height) {
    const sizeFlag = decode83(hash[0]);
    const numX = (sizeFlag % 9) + 1;
    const numY = Math.floor(sizeFlag / 9) + 1;

    const maxValue = (decode83(hash[1]) + 1) / 166;

    const colors = [];
    for (let i = 0; i < numX * numY; i++) {
      if (i === 0) {
        const value = decode83(hash.substring(2, 6));
        colors.push([sRGBToLinear(value >> 16), sRGBToLinear((value >> 8) & 255), sRGBToLinear(value & 255)]);
      } else {
        const value = decode83(hash.substring(4 + i * 2, 6 + i * 2));
        colors.push([
          signPow((Math.floor(value / (19 * 19)) - 9) / 9, 2) * maxValue,
          signPow((Math.floor(value / 19) % 19 - 9) / 9, 2) * maxValue,
          signPow((value % 19 - 9) / 9, 2) * maxValue,
        ]);
      }
    }

    const bytesPerRow = width * 4;
    const pixels = new Uint8ClampedArray(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0;
        for (let j = 0; j < numY; j++) {
          for (let i = 0; i < numX; i++) {
            const basis = Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height);
            const color = colors[i + j * numX];
            r += color[0] * basis;
            g += color[1] * basis;
            b += color[2] * basis;
          }
        }
        const pixelIndex = 4 * x + y * bytesPerRow;
        pixels[pixelIndex] = linearToSRGB(r);
        pixels[pixelIndex + 1] = linearToSRGB(g);
        pixels[pixelIndex + 2] = linearToSRGB(b);
        pixels[pixelIndex + 3] = 255;
      }
    }
    return pixels;
  }

  function blurhashToDataUrl(hash) {
    try {
      const size = 32;
      const pixels = decodeBlurhash(hash, size, size);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.putImageData(new ImageData(pixels, size, size), 0, 0);
      return canvas.toDataURL();
    } catch {
      return null;
    }
  }

  function buildMediaElement(original) {
    if (!original.media_attachments || !original.media_attachments.length) return null;
    const media = document.createElement('div');
    media.className = 'status-media';
    original.media_attachments.forEach(att => {
      if (att.type === 'image') {
        const img = document.createElement('img');
        const fullSrc = att.url || att.preview_url;
        const dimensions = att.meta?.original || att.meta?.small;
        if (dimensions?.width && dimensions?.height) {
          img.width = dimensions.width;
          img.height = dimensions.height;
        }
        if (att.blurhash) {
          const placeholder = blurhashToDataUrl(att.blurhash);
          if (placeholder) {
            img.style.backgroundImage = `url(${placeholder})`;
            img.addEventListener('load', () => { img.style.backgroundImage = ''; }, { once: true });
          }
        }
        img.src = fullSrc;
        img.alt = att.description || 'Photo without a description';
        img.loading = 'lazy';
        img.tabIndex = 0;
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', att.description ? `View photo: ${att.description}` : 'View photo full size');
        img.addEventListener('click', () => openLightbox(fullSrc, att.description, img));
        img.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openLightbox(fullSrc, att.description, img);
          }
        });
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

  // ---------- icons ----------

  const FAV_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12 2.5 15.09 9.26 22.5 9.99 17 15.02 18.54 22.5 12 18.5 5.46 22.5 7 15.02 1.5 9.99 8.91 9.26"/></svg>';
  const BOOST_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>';
  const LINK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

  function renderStatusCard(status) {
    const isReblog = !!status.reblog;
    const original = isReblog ? status.reblog : status;
    const isNew = !!state.lastSeenBefore && new Date(status.created_at) > new Date(state.lastSeenBefore);

    const card = document.createElement('div');
    card.className = isNew ? 'status-card is-new' : 'status-card';

    if (isReblog) {
      const banner = document.createElement('div');
      banner.className = 'reblog-banner';
      banner.innerHTML = `<span class="btn-icon" aria-hidden="true">${BOOST_ICON_SVG}</span>${escapeHtml(status.account.display_name || status.account.username)} boosted`;
      card.appendChild(banner);
    }

    const profileUrl = original.account.url;
    const profileIsSafe = !!(profileUrl && isHttpUrl(profileUrl));
    const displayName = escapeHtml(original.account.display_name || original.account.username);
    const avatarImg = `<img src="${escapeAttr(original.account.avatar)}" alt="">`;

    const header = document.createElement('div');
    header.className = 'status-header';
    header.innerHTML = `
      ${profileIsSafe ? `<a href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener noreferrer">${avatarImg}</a>` : avatarImg}
      <div class="status-author">
        <div class="display-name">${profileIsSafe ? `<a href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener noreferrer">${displayName}</a>` : displayName}</div>
        ${profileIsSafe
          ? `<a class="username" href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(original.account.acct)}</a>`
          : `<div class="username">@${escapeHtml(original.account.acct)}</div>`}
      </div>
      <div class="status-meta">
        ${isNew ? '<span class="new-badge">New</span>' : ''}
        <div class="status-date">${escapeHtml(formatStatusDate(original.created_at))}</div>
      </div>
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
    favBtn.innerHTML = `<span class="btn-icon" aria-hidden="true">${FAV_ICON_SVG}</span><span class="sr-only">Favourite,</span> <span class="btn-count">${original.favourites_count}</span>`;
    if (original.favourited) favBtn.classList.add('active');
    favBtn.addEventListener('click', () => toggleFavourite(original.id, favBtn));
    actions.appendChild(favBtn);

    const boostBtn = document.createElement('button');
    boostBtn.innerHTML = `<span class="btn-icon" aria-hidden="true">${BOOST_ICON_SVG}</span><span class="sr-only">Reblog,</span> <span class="btn-count">${original.reblogs_count}</span>`;
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
      originalLink.innerHTML = `<span class="btn-icon" aria-hidden="true">${LINK_ICON_SVG}</span><span class="btn-label">View post</span>`;
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
      btn.querySelector('.btn-count').textContent = updated.favourites_count;
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
      btn.querySelector('.btn-count').textContent = target.reblogs_count;
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

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
