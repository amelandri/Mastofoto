import { isHttpUrl, hasPhoto, parseNextMaxId, escapeHtml, renderEmojiText, mediaGridColumns, parseTagFilter, statusMatchesTagFilter } from './pure.mjs';

(() => {
  'use strict';

  const APP_VERSION = '0.6.0';
  const REDIRECT_URI = window.location.origin + window.location.pathname;
  const SCOPES = 'read write:favourites write:statuses';
  const APP_NAME = 'Mastofoto';
  const PENDING_INSTANCE_KEY = 'mastofoto:pendingInstance';
  const PENDING_STATE_KEY = 'mastofoto:pendingState';
  const THEME_KEY = 'mastofoto:theme';
  const FONT_SIZE_OFFSET_KEY = 'mastofoto:postFontSizeOffset';
  const FONT_SIZE_OFFSET_MIN = -0.5;
  const FONT_SIZE_OFFSET_MAX = 0.5;
  const INCLUDE_REBLOGS_KEY = 'mastofoto:includeReblogs';
  const SHOW_PROFILE_BANNER_KEY = 'mastofoto:showProfileBanner';
  const HOME_TIMELINE_ID = 'home';

  // crypto.randomUUID() requires a secure context (HTTPS, or http://localhost)
  // and is undefined otherwise — e.g. testing on a phone over a plain
  // http://<lan-ip> origin. crypto.getRandomValues() has no such restriction,
  // so fall back to building a v4 UUID from it by hand when needed.
  function randomUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
  }

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

  // ---------- post text size ----------

  function getPreferredFontSizeOffset() {
    const stored = parseFloat(localStorage.getItem(FONT_SIZE_OFFSET_KEY));
    if (Number.isNaN(stored)) return 0;
    return Math.min(FONT_SIZE_OFFSET_MAX, Math.max(FONT_SIZE_OFFSET_MIN, stored));
  }

  function applyFontSizeOffset(offset) {
    document.documentElement.style.setProperty('--post-font-size', `${1 + offset}rem`);
  }

  applyFontSizeOffset(getPreferredFontSizeOffset());

  // ---------- feed content settings ----------

  function getPreferredIncludeReblogs() {
    const stored = localStorage.getItem(INCLUDE_REBLOGS_KEY);
    return stored === null ? true : stored === 'true';
  }

  function getPreferredShowProfileBanner() {
    const stored = localStorage.getItem(SHOW_PROFILE_BANNER_KEY);
    return stored === null ? true : stored === 'true';
  }

  function applyShowProfileBanner(show) {
    el.profileBanner.classList.toggle('hidden', !show);
  }

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

  function replaceEmojiShortcodes(textNode, emojis) {
    if (!emojis.length) return;
    const hasShortcode = emojis.some(emoji => emoji && emoji.shortcode && textNode.data.includes(`:${emoji.shortcode}:`));
    if (!hasShortcode) return;
    const wrapper = document.createElement('span');
    wrapper.innerHTML = renderEmojiText(textNode.data, emojis);
    textNode.replaceWith(...wrapper.childNodes);
  }

  function sanitizeStatusHtml(html, emojis = []) {
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
        } else if (child.nodeType === Node.TEXT_NODE) {
          replaceEmojiShortcodes(child, emojis);
        } else {
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
    accountId: null,
    currentListId: null,
  };

  // Timeline-only "New" badge marker — Profile never tracks this (own posts
  // don't need a "new since last visit" concept). Kept outside `state` since
  // nothing else needs to read/write it.
  let timelineLastSeenBefore = null;

  function lastSeenKey(listId) {
    return `lastSeen:${listId}`;
  }

  function formatStatusDate(dateStr) {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }


  // ---------- DOM refs ----------

  const el = {
    instanceInput: document.getElementById('instance-input'),
    connectBtn: document.getElementById('connect-btn'),
    loginError: document.getElementById('login-error'),
    loginView: document.getElementById('login-view'),
    timelineView: document.getElementById('timeline-view'),
    timelineBtn: document.getElementById('timeline-btn'),
    currentInstance: document.getElementById('current-instance'),
    logoutBtn: document.getElementById('logout-btn'),
    changeListBtn: document.getElementById('change-list-btn'),
    statuses: document.getElementById('statuses'),
    timelineError: document.getElementById('timeline-error'),
    scrollSentinel: document.getElementById('scroll-sentinel'),
    loadMoreStatus: document.getElementById('load-more-status'),
    profileBtn: document.getElementById('profile-btn'),
    profileView: document.getElementById('profile-view'),
    profileStatuses: document.getElementById('profile-statuses'),
    profileError: document.getElementById('profile-error'),
    profileScrollSentinel: document.getElementById('profile-scroll-sentinel'),
    profileLoadMoreStatus: document.getElementById('profile-load-more-status'),
    profileBanner: document.getElementById('profile-banner'),
    showProfileBannerCheckbox: document.getElementById('show-profile-banner-checkbox'),
    profileBannerImage: document.getElementById('profile-banner-image'),
    profileBannerAvatar: document.getElementById('profile-banner-avatar'),
    profileBannerDisplayName: document.getElementById('profile-banner-displayname'),
    profileBannerUsername: document.getElementById('profile-banner-username'),
    listSetupView: document.getElementById('list-setup-view'),
    listSetupHomeBtn: document.getElementById('list-setup-home-btn'),
    listSelect: document.getElementById('list-select'),
    useListBtn: document.getElementById('use-list-btn'),
    includeReblogsCheckbox: document.getElementById('include-reblogs-checkbox'),
    themeSelect: document.getElementById('theme-select'),
    fontSizeSlider: document.getElementById('font-size-slider'),
    listSetupError: document.getElementById('list-setup-error'),
    noListMessage: document.getElementById('no-list-message'),
    listMembersHeading: document.getElementById('list-members-heading'),
    listMembers: document.getElementById('list-members'),
    profileTagsInput: document.getElementById('profile-tags-input'),
    lightbox: document.getElementById('lightbox'),
    lightboxImg: document.getElementById('lightbox-img'),
    infoBtn: document.getElementById('info-btn'),
    infoView: document.getElementById('info-view'),
    infoHomeBtn: document.getElementById('info-home-btn'),
    loginInfoBtn: document.getElementById('login-info-btn'),
    appVersion: document.getElementById('app-version'),
    pullRefresh: document.getElementById('pull-refresh'),
    pullRefreshLabel: document.getElementById('pull-refresh-label'),
    lightboxClose: document.getElementById('lightbox-close'),
  };

  // ---------- view switching ----------
  // Exactly one of these five <section>s is ever visible at a time; showView()
  // is the single place that enforces that, so a handler can never forget to
  // hide a view it's navigating away from (see CHANGELOG for the logout bug
  // this replaced).

  const VIEWS = [el.loginView, el.listSetupView, el.timelineView, el.profileView, el.infoView];

  // Highlighted in the header nav whenever their mapped view is the one
  // showing — login-view has no persistent nav button, so it's intentionally
  // absent here (nothing is highlighted while on the login screen).
  const VIEW_NAV_BUTTONS = new Map([
    [el.timelineView, el.timelineBtn],
    [el.profileView, el.profileBtn],
    [el.listSetupView, el.changeListBtn],
    [el.infoView, el.infoBtn],
  ]);

  function showView(view) {
    VIEWS.forEach(hide);
    show(view);
    VIEW_NAV_BUTTONS.forEach((btn, mappedView) => {
      const isActive = mappedView === view;
      btn.classList.toggle('active', isActive);
      if (isActive) {
        btn.setAttribute('aria-current', 'true');
      } else {
        btn.removeAttribute('aria-current');
      }
    });
  }

  // "Home Page" links in list-setup-view/info-view used to be plain <a href=".">
  // anchors, causing a full page reload (re-fetching app.js, re-running
  // verify_credentials, and re-fetching the timeline from scratch) just to get
  // back to a view that was already loaded in memory. goHome() instead reuses
  // showView() like every other navigation in this file.
  function goHome() {
    if (!state.token) {
      showView(el.loginView);
    } else if (state.currentListId) {
      showView(el.timelineView);
    } else {
      showView(el.listSetupView);
    }
  }

  el.appVersion.textContent = APP_VERSION;

  el.themeSelect.value = getPreferredTheme();
  el.themeSelect.addEventListener('change', () => {
    const theme = el.themeSelect.value;
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  });

  el.fontSizeSlider.value = getPreferredFontSizeOffset();
  el.fontSizeSlider.addEventListener('input', () => {
    const offset = Math.round(parseFloat(el.fontSizeSlider.value) * 10) / 10;
    localStorage.setItem(FONT_SIZE_OFFSET_KEY, offset);
    applyFontSizeOffset(offset);
  });

  el.includeReblogsCheckbox.checked = getPreferredIncludeReblogs();
  el.includeReblogsCheckbox.addEventListener('change', () => {
    localStorage.setItem(INCLUDE_REBLOGS_KEY, String(el.includeReblogsCheckbox.checked));
    // Changes what gets fetched/filtered, not just how it's displayed — unlike
    // theme/font size, so re-run the current timeline to actually reflect it,
    // the same reset selectList() already does when switching lists.
    if (state.currentListId) selectList(state.currentListId);
  });

  el.showProfileBannerCheckbox.checked = getPreferredShowProfileBanner();
  applyShowProfileBanner(el.showProfileBannerCheckbox.checked);
  el.showProfileBannerCheckbox.addEventListener('change', () => {
    const show = el.showProfileBannerCheckbox.checked;
    localStorage.setItem(SHOW_PROFILE_BANNER_KEY, String(show));
    applyShowProfileBanner(show);
  });

  el.profileTagsInput.addEventListener('change', () => {
    saveInstanceData(state.instance, { profileTags: el.profileTagsInput.value });
    // Unlike the reblog checkbox above, Profile is lazy (only ever fetched
    // via ensureLoaded() on first visit — see the feed engine section below)
    // rather than eagerly kept warm in the background like Timeline, so
    // there's nothing to eagerly re-run here: reset() just marks it stale,
    // and the next visit to Profile naturally fetches with the new filter.
    profileFeed.reset();
  });

  // ---------- lightbox ----------

  const LIGHTBOX_SWIPE_THRESHOLD = 50;

  let lightboxTrigger = null;
  let lightboxPhotos = [];
  let lightboxIndex = 0;
  let lightboxTouchStartX = null;
  let lightboxTouchStartY = null;
  let lightboxSwiping = false;

  function openLightbox(photos, index, triggerEl) {
    lightboxPhotos = photos;
    lightboxTrigger = triggerEl || document.activeElement;
    showLightboxPhoto(index);
    show(el.lightbox);
    el.lightboxClose.focus();
  }

  function showLightboxPhoto(index) {
    const photo = lightboxPhotos[index];
    if (!photo) return;
    lightboxIndex = index;
    el.lightboxImg.src = photo.src;
    el.lightboxImg.alt = photo.alt || 'Photo without a description';
  }

  function showAdjacentLightboxPhoto(direction) {
    showLightboxPhoto(lightboxIndex + direction);
  }

  function closeLightbox() {
    hide(el.lightbox);
    el.lightboxImg.src = '';
    lightboxPhotos = [];
    lightboxIndex = 0;
    if (lightboxTrigger) lightboxTrigger.focus();
    lightboxTrigger = null;
  }

  el.lightbox.addEventListener('click', closeLightbox);
  el.lightboxClose.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
    if (el.lightbox.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') showAdjacentLightboxPhoto(1);
    if (e.key === 'ArrowLeft') showAdjacentLightboxPhoto(-1);
  });

  el.lightbox.addEventListener('touchstart', (e) => {
    if (lightboxPhotos.length < 2) return;
    lightboxTouchStartX = e.touches[0].clientX;
    lightboxTouchStartY = e.touches[0].clientY;
    lightboxSwiping = false;
  }, { passive: true });

  el.lightbox.addEventListener('touchmove', (e) => {
    if (lightboxTouchStartX === null) return;
    const deltaX = e.touches[0].clientX - lightboxTouchStartX;
    const deltaY = e.touches[0].clientY - lightboxTouchStartY;
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      lightboxSwiping = true;
      e.preventDefault();
    }
  }, { passive: false });

  el.lightbox.addEventListener('touchend', (e) => {
    if (lightboxTouchStartX === null) return;
    const deltaX = e.changedTouches[0].clientX - lightboxTouchStartX;
    lightboxTouchStartX = null;
    lightboxTouchStartY = null;
    if (lightboxSwiping && Math.abs(deltaX) >= LIGHTBOX_SWIPE_THRESHOLD) {
      e.preventDefault();
      showAdjacentLightboxPhoto(deltaX < 0 ? 1 : -1);
    }
    lightboxSwiping = false;
  });

  // ---------- pull to refresh ----------

  const PULL_THRESHOLD = 70;
  const PULL_MAX = 100;
  let pullStartY = null;
  let pulling = false;

  function setPullHeight(px) {
    el.pullRefresh.style.height = `${px}px`;
  }

  document.addEventListener('touchstart', (e) => {
    if (el.timelineView.classList.contains('hidden')) return;
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
      el.pullRefreshLabel.textContent = 'Refreshing…';
      setPullHeight(50);
      try {
        await timelineFeed.load(false);
      } finally {
        setPullHeight(0);
        el.pullRefresh.classList.remove('ready');
        el.pullRefreshLabel.textContent = 'Pull to refresh';
      }
    } else {
      setPullHeight(0);
      el.pullRefresh.classList.remove('ready');
    }
  });

  // ---------- info page ----------

  el.infoBtn.addEventListener('click', () => showView(el.infoView));
  el.loginInfoBtn.addEventListener('click', () => showView(el.infoView));
  el.listSetupHomeBtn.addEventListener('click', goHome);
  el.infoHomeBtn.addEventListener('click', goHome);

  el.timelineBtn.addEventListener('click', () => showView(el.timelineView));
  el.profileBtn.addEventListener('click', () => {
    showView(el.profileView);
    profileFeed.ensureLoaded();
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
      const csrfState = randomUUID();
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
    state.accountId = null;
    state.currentListId = null;
    hide(el.timelineBtn);
    hide(el.profileBtn);
    hide(el.changeListBtn);
    hide(el.logoutBtn);
    showView(el.loginView);
    el.instanceInput.value = '';
    el.currentInstance.textContent = '';
    // A different account may log in next — never leave stale photos from
    // this one sitting in the Profile feed.
    profileFeed.reset();
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
    updateListPreview(el.listSelect.value);
  });

  function updateListPreview(listId) {
    if (!listId || listId === HOME_TIMELINE_ID) {
      el.listMembers.innerHTML = '';
      hide(el.listMembersHeading);
      return;
    }
    return loadListMembers(listId);
  }

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
        const name = renderEmojiText(account.display_name || account.username, account.emojis);
        item.innerHTML = `
          <img src="${escapeAttr(account.avatar)}" alt="">
          <div class="member-info">
            ${account.url && isHttpUrl(account.url)
              ? `<a class="member-name" href="${escapeAttr(account.url)}" target="_blank" rel="noopener noreferrer">${name}</a>`
              : `<span class="member-name">${name}</span>`}
            <span class="member-handle">@${escapeHtml(account.acct)}</span>
          </div>
        `;
        setImgErrorFallback(item.querySelector('img'), AVATAR_FALLBACK);
        item.querySelectorAll('img.emoji').forEach(img => setImgErrorFallback(img, TRANSPARENT_PIXEL));
        el.listMembers.appendChild(item);
      });
    } catch (err) {
      showError(el.listSetupError, err.message);
    }
  }

  async function startSession(instance, token) {
    // verify token is still valid, and capture the account's own id (needed
    // for the Profile view's GET /api/v1/accounts/:id/statuses)
    const res = await apiFetch(instance, token, '/api/v1/accounts/verify_credentials');
    const account = await res.json();
    state.instance = instance;
    state.token = token;
    state.accountId = account.id;
    localStorage.setItem('mastofoto:lastInstance', instance);

    show(el.timelineBtn);
    show(el.profileBtn);
    show(el.changeListBtn);
    show(el.logoutBtn);
    el.currentInstance.textContent = instance;
    el.profileTagsInput.value = getInstanceData(instance, 'profileTags') || '';

    // Profile's banner (cover image + avatar/name/handle overlay) is static
    // per account, so it's populated once here rather than by profileFeed —
    // that engine only ever deals with paginated posts, not account info.
    el.profileBannerImage.src = account.header_static || account.header || '';
    setImgErrorFallback(el.profileBannerImage, TRANSPARENT_PIXEL);
    el.profileBannerAvatar.src = account.avatar;
    setImgErrorFallback(el.profileBannerAvatar, AVATAR_FALLBACK);
    el.profileBannerDisplayName.innerHTML = renderEmojiText(account.display_name || account.username, account.emojis);
    el.profileBannerUsername.textContent = `@${account.acct}`;

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

    const homeOption = document.createElement('option');
    homeOption.value = HOME_TIMELINE_ID;
    homeOption.textContent = 'Home timeline';
    el.listSelect.appendChild(homeOption);

    try {
      const res = await apiFetch(state.instance, state.token, '/api/v1/lists');
      const lists = await res.json();

      if (!lists.length) {
        show(el.noListMessage);
      } else {
        lists.forEach(list => {
          const option = document.createElement('option');
          option.value = list.id;
          option.textContent = list.title;
          el.listSelect.appendChild(option);
        });
      }

      if (preselectListId) el.listSelect.value = String(preselectListId);
      await updateListPreview(el.listSelect.value);
    } catch (err) {
      showError(el.listSetupError, err.message);
    }
  }

  async function selectList(listId) {
    state.currentListId = listId;
    timelineFeed.reset();
    await timelineFeed.load(false);
  }

  // ---------- feed engine (shared by Timeline and Profile) ----------
  //
  // load() is called from multiple independent places per feed — a fresh
  // selection/first visit, pull-to-refresh (Timeline only), and auto-
  // continuation triggered by scrolling near the bottom. A plain boolean
  // "busy" guard would let one of these silently no-op if it overlaps
  // another (e.g. pull-to-refresh flashing "Refreshing…" and resetting
  // without ever actually refreshing, if a background auto-load happened to
  // be in flight at that exact moment) — so every call instead goes through
  // a shared per-feed queue: it always eventually runs, in order, never
  // dropped. Timeline and Profile each get their own independent instance
  // (own queue, own cursor, own circuit breaker, own IntersectionObserver)
  // via createFeedEngine(), so neither can ever refetch or clobber the
  // other's already-loaded content.
  const AUTO_LOAD_MARGIN_PX = 400;
  const MAX_CONSECUTIVE_EMPTY_PAGES = 20; // defensive backstop against a pagination bug or a pathologically photo-sparse timeline, not a UX pacing device — should never be hit in normal use

  function createFeedEngine({ view, container, errorEl, sentinel, loadMoreEl, buildPath, filterStatuses, onFreshLoad, renderCard }) {
    const cursor = { nextMaxId: null, hasMore: true };
    let pendingCalls = 0;
    let queue = Promise.resolve();
    let consecutiveEmptyPages = 0;
    let hasLoadedOnce = false;

    function renderStatuses(statuses, append) {
      if (!append) container.innerHTML = '';
      statuses.forEach(status => container.appendChild(renderCard(status)));
    }

    async function runLoad(append) {
      try {
        hide(errorEl);
        const res = await apiFetch(state.instance, state.token, buildPath(append, cursor.nextMaxId));
        const statuses = await res.json();
        cursor.nextMaxId = parseNextMaxId(res.headers.get('Link'), statuses);
        cursor.hasMore = statuses.length > 0;

        const photoStatuses = filterStatuses(statuses);
        consecutiveEmptyPages = (append && photoStatuses.length === 0) ? consecutiveEmptyPages + 1 : 0;

        if (!append && onFreshLoad) onFreshLoad(photoStatuses);

        renderStatuses(photoStatuses, append);
        return true;
      } catch (err) {
        showError(errorEl, err.message);
        return false;
      }
    }

    function sentinelNearViewport() {
      const rect = sentinel.getBoundingClientRect();
      return rect.top <= window.innerHeight + AUTO_LOAD_MARGIN_PX;
    }

    // Called after every load() call settles. Covers both auto-paging
    // through pages with zero photos (the sentinel doesn't move, so an
    // IntersectionObserver alone would never refire) and a short feed that
    // fits on one screen after a fresh load (no enter/exit transition either).
    function maybeLoadMore() {
      if (pendingCalls > 0) return false;
      if (view.classList.contains('hidden')) return false; // must precede the geometry check below: a hidden ancestor collapses to a zeroed rect, which would otherwise read as "near the top"
      if (!cursor.hasMore) return false;
      if (consecutiveEmptyPages >= MAX_CONSECUTIVE_EMPTY_PAGES) return false;
      if (!sentinelNearViewport()) return false;
      load(true);
      return true;
    }

    function load(append) {
      pendingCalls++;
      if (append) show(loadMoreEl);
      const run = queue
        .then(() => runLoad(append))
        .finally(() => { pendingCalls--; });
      queue = run.catch(() => {}); // keep the chain alive even if this run failed
      run.then(ok => {
        const continuing = ok && maybeLoadMore();
        if (append && !continuing) hide(loadMoreEl);
      });
      return run;
    }

    function reset() {
      cursor.nextMaxId = null;
      cursor.hasMore = true;
      consecutiveEmptyPages = 0;
      hasLoadedOnce = false;
      container.innerHTML = '';
    }

    // Only Profile calls this today — Timeline's content is already loaded
    // eagerly by startSession()/selectList(), so its button never needs to
    // trigger a load itself, just show the (already-loading-or-loaded) view.
    function ensureLoaded() {
      if (hasLoadedOnce) return Promise.resolve(true);
      hasLoadedOnce = true;
      return load(false);
    }

    // Fires its initial callback the moment observe() runs (module-eval
    // time, before login) — maybeLoadMore()'s hidden-view check is what
    // prevents a premature fetch before a session/list even exists.
    new IntersectionObserver(() => maybeLoadMore(), {
      rootMargin: `0px 0px ${AUTO_LOAD_MARGIN_PX}px 0px`,
    }).observe(sentinel);

    return { load, reset, ensureLoaded, maybeLoadMore };
  }

  const timelineFeed = createFeedEngine({
    view: el.timelineView,
    container: el.statuses,
    errorEl: el.timelineError,
    sentinel: el.scrollSentinel,
    loadMoreEl: el.loadMoreStatus,
    buildPath(append, nextMaxId) {
      const path = state.currentListId === HOME_TIMELINE_ID
        ? '/api/v1/timelines/home'
        : `/api/v1/timelines/list/${state.currentListId}`;
      const params = new URLSearchParams({ limit: '20' });
      if (append && nextMaxId) params.set('max_id', nextMaxId);
      return `${path}?${params.toString()}`;
    },
    // By default boosts are excluded outright, not just ones without a
    // photo — a stricter filter than hasPhoto() alone, so a page can come
    // up empty (or thin) more often on a boost-heavy list/timeline. That's
    // fine: this engine already re-checks after every page and keeps going
    // regardless of *why* a page had little to show.
    filterStatuses(statuses) {
      const includeReblogs = getPreferredIncludeReblogs();
      return statuses.filter(s => (includeReblogs || !s.reblog) && hasPhoto(s));
    },
    onFreshLoad(photoStatuses) {
      timelineLastSeenBefore = getInstanceData(state.instance, lastSeenKey(state.currentListId));
      if (photoStatuses.length) {
        saveInstanceData(state.instance, { [lastSeenKey(state.currentListId)]: photoStatuses[0].created_at });
      }
    },
    renderCard(status) {
      const isNew = !!timelineLastSeenBefore && new Date(status.created_at) > new Date(timelineLastSeenBefore);
      return renderStatusCard(status, isNew, true);
    },
  });

  // Profile shows only the logged-in account's own photo posts — boosts are
  // always excluded server-side (exclude_reblogs=true) regardless of the
  // "Show boosts in the feed" setting above, which only ever applies to
  // Timeline. No "New" badge (own posts don't need a "since your last
  // visit" marker, so no onFreshLoad) and no Favourite/Reblog actions, just
  // "View post" (see renderStatusCard's third parameter).
  const profileFeed = createFeedEngine({
    view: el.profileView,
    container: el.profileStatuses,
    errorEl: el.profileError,
    sentinel: el.profileScrollSentinel,
    loadMoreEl: el.profileLoadMoreStatus,
    buildPath(append, nextMaxId) {
      const params = new URLSearchParams({ limit: '20', only_media: 'true', exclude_reblogs: 'true' });
      if (append && nextMaxId) params.set('max_id', nextMaxId);
      return `/api/v1/accounts/${state.accountId}/statuses?${params.toString()}`;
    },
    // only_media=true admits any media attachment, not specifically images
    // (a status can carry 1-4 images, or exactly one video/gifv/audio) — so
    // hasPhoto() is still required here, it's not redundant with that param.
    // The tag filter (Settings > Profile, per-instance) is read fresh on
    // every page rather than cached, so a change takes effect on the very
    // next load without needing its own separate invalidation path.
    filterStatuses(statuses) {
      const tags = parseTagFilter(getInstanceData(state.instance, 'profileTags'));
      return statuses.filter(s => hasPhoto(s) && statusMatchesTagFilter(s, tags));
    },
    onFreshLoad: null,
    renderCard(status) {
      return renderStatusCard(status, false, false, false);
    },
  });

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

  // A 1x1 transparent PNG. Swapped in as `src` when a photo or custom emoji
  // fails to load, so the browser's native broken-image icon/border (and, on
  // some mobile browsers, a visible alt-text box) never appears. For a photo
  // this leaves the blurhash background-image as the only visible result;
  // for an emoji (no blurhash of its own) it just quietly disappears rather
  // than showing a broken-image glyph inline with text.
  const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

  // Shown in place of an account avatar that fails to load, instead of the
  // browser's broken-image icon.
  const AVATAR_FALLBACK = 'assets/favicon.png';

  function setImgErrorFallback(img, fallbackSrc) {
    img.addEventListener('error', () => { img.src = fallbackSrc; }, { once: true });
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
    const photos = original.media_attachments
      .filter(att => att.type === 'image')
      .map(att => ({ src: att.url || att.preview_url, alt: att.description }));
    if (photos.length > 1) {
      media.classList.add('status-media-grid');
      media.style.setProperty('--media-columns', String(mediaGridColumns(photos.length)));
    }
    let photoIndex = 0;
    original.media_attachments.forEach(att => {
      if (att.type === 'image') {
        const img = document.createElement('img');
        const fullSrc = att.url || att.preview_url;
        const index = photoIndex++;
        const dimensions = att.meta?.original || att.meta?.small;
        if (dimensions?.width && dimensions?.height) {
          img.width = dimensions.width;
          img.height = dimensions.height;
        }
        if (att.blurhash) {
          const placeholder = blurhashToDataUrl(att.blurhash);
          if (placeholder) {
            img.style.backgroundImage = `url(${placeholder})`;
            const clearPlaceholder = () => { img.style.backgroundImage = ''; };
            img.addEventListener('load', clearPlaceholder, { once: true });
            img.addEventListener('error', () => img.removeEventListener('load', clearPlaceholder), { once: true });
          }
        }
        img.addEventListener('error', () => {
          img.src = TRANSPARENT_PIXEL;
          // A single-photo post otherwise reserves space at the original
          // photo's own aspect ratio (from the width/height attributes set
          // above), which can be tall for a portrait shot — pointless once
          // there's no photo left to show, just a blurhash placeholder.
          // Force a shorter, fixed ratio instead (same 4:3 the multi-photo
          // grid already uses, so this is a no-op there, not a conflict).
          img.classList.add('media-load-failed');
        }, { once: true });
        img.src = fullSrc;
        img.alt = att.description || 'Photo without a description';
        img.loading = 'lazy';
        img.tabIndex = 0;
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', att.description ? `View photo: ${att.description}` : 'View photo full size');
        img.addEventListener('click', () => openLightbox(photos, index, img));
        img.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openLightbox(photos, index, img);
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

  function renderStatusCard(status, isNew = false, showActions = true, showAuthor = true) {
    const isReblog = !!status.reblog;
    const original = isReblog ? status.reblog : status;

    const card = document.createElement('div');
    card.className = isNew ? 'status-card is-new' : 'status-card';

    if (isNew) {
      const badge = document.createElement('span');
      badge.className = 'new-badge';
      badge.textContent = 'New';
      card.appendChild(badge);
    }

    if (isReblog) {
      const banner = document.createElement('div');
      banner.className = 'reblog-banner';
      banner.innerHTML = `<span class="btn-icon" aria-hidden="true">${BOOST_ICON_SVG}</span>${renderEmojiText(status.account.display_name || status.account.username, status.account.emojis)} boosted`;
      card.appendChild(banner);
    }

    const header = document.createElement('div');

    if (showAuthor) {
      const profileUrl = original.account.url;
      const profileIsSafe = !!(profileUrl && isHttpUrl(profileUrl));
      const displayName = renderEmojiText(original.account.display_name || original.account.username, original.account.emojis);
      const avatarImg = `<img src="${escapeAttr(original.account.avatar)}" alt="">`;

      header.className = 'status-header';
      header.innerHTML = `
        ${profileIsSafe ? `<a href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener noreferrer">${avatarImg}</a>` : avatarImg}
        <div class="status-author">
          <div class="display-name">${profileIsSafe ? `<a href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener noreferrer">${displayName}</a>` : displayName}</div>
          ${profileIsSafe
            ? `<a class="username" href="${escapeAttr(profileUrl)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(original.account.acct)}</a>`
            : `<div class="username">@${escapeHtml(original.account.acct)}</div>`}
        </div>
        <div class="status-date">${escapeHtml(formatStatusDate(original.created_at))}</div>
      `;
      setImgErrorFallback(header.querySelector('img'), AVATAR_FALLBACK);
    } else {
      // Profile already knows whose posts these are — repeating your own
      // avatar/name on every single card is just noise there. Only the date
      // remains, laid out as plain flowed text rather than reusing the
      // avatar/name layout's position:absolute corner anchor (see
      // .status-header.status-header-date-only in style.css), since that
      // anchor exists specifically to coexist with the avatar/name row this
      // variant doesn't have.
      header.className = 'status-header status-header-date-only';
      header.innerHTML = `<div class="status-date">${escapeHtml(formatStatusDate(original.created_at))}</div>`;
    }
    card.appendChild(header);

    const media = buildMediaElement(original);

    if (original.spoiler_text) {
      const cw = document.createElement('details');
      const summary = document.createElement('summary');
      summary.innerHTML = renderEmojiText(original.spoiler_text, original.emojis);
      cw.appendChild(summary);
      if (media) cw.appendChild(media);
      const content = document.createElement('div');
      content.className = 'status-content';
      content.innerHTML = sanitizeStatusHtml(original.content, original.emojis);
      cw.appendChild(content);
      card.appendChild(cw);
    } else {
      if (media) card.appendChild(media);
      const content = document.createElement('div');
      content.className = 'status-content';
      content.innerHTML = sanitizeStatusHtml(original.content, original.emojis);
      card.appendChild(content);
    }

    const actions = document.createElement('div');
    actions.className = 'status-actions';

    if (showActions) {
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
    }

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
    card.querySelectorAll('img.emoji').forEach(img => setImgErrorFallback(img, TRANSPARENT_PIXEL));
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
  const escapeAttr = escapeHtml;

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
      showView(el.loginView);
      showError(el.loginError, `Authorization denied by the instance (${authError}).`);
      return;
    }

    if (code) {
      try {
        const handled = await completeAuthorization(code, returnedState);
        if (handled) return;
      } catch (err) {
        showView(el.loginView);
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
          return;
        } catch (err) {
          clearInstanceData(lastInstance);
        }
      }
    }

    showView(el.loginView);
  })();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
