# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Mastofoto is a static, single-user web app (`index.html` + `style.css` + `app.js`) that lets someone log into a Mastodon instance, pick one Mastodon list, and view only the posts in that list that contain photos (image attachments), with the ability to favourite and reblog them. It runs entirely client-side against the Mastodon REST API — there is no backend, no build step, and no database. All persisted state lives in the browser's `localStorage`. The page has no external dependencies besides the Mastodon instance itself; the header wordmark is a pre-rendered static image (`assets/logo.png`) rather than a webfont, so nothing is fetched from a font CDN at runtime.

## Development

There is no package manager, build step, linter, or test suite in this repo. To work on it:

- Open `index.html` directly in a browser (double-click, or `open index.html` on macOS), or serve the directory with any static file server if the browser blocks `fetch()` from `file://` (e.g. `python3 -m http.server`).
- After editing `app.js`, check it parses with `node --check app.js` — this is the only automated verification available; there is no linter or test runner.
- End-to-end testing (OAuth login, list fetching, favourite/reblog) requires a real Mastodon account/instance and cannot be simulated locally.

## Architecture

All logic lives in `app.js` as a single IIFE with a small `state` object (`instance`, `token`, `currentListId`, `nextMaxId`) and an `el` object caching DOM references. Views are plain `<section>`s in `index.html` shown/hidden via a `.hidden` CSS class (`login-view`, `list-setup-view`, `timeline-view`) — there is no router or framework.

**Auth flow (OAuth2, out-of-band, no redirect URI):**
1. User enters an instance domain. If no app credentials exist yet for that instance, `registerApp()` calls `POST /api/v1/apps` to dynamically register the app and stores `client_id`/`client_secret`.
2. The authorize URL uses `redirect_uri = urn:ietf:wg:oauth:2.0:oob` so Mastodon displays the code on-screen instead of redirecting — this avoids needing a fixed hosting URL, which matters since the app may be run from `file://`.
3. The user pastes the code back in; `exchangeCodeForToken()` calls `POST /oauth/token` and stores the resulting access token.
4. Scope requested is `read write:favourites write:statuses` — enough for reading lists/timelines and for favouriting/reblogging, deliberately excluding general posting.

All credentials (`clientId`, `clientSecret`, `accessToken`, `listId`) are namespaced per-instance in `localStorage` via `storageKey(instance, name)` (`mastofoto:<instance>:<name>`), plus a `mastofoto:lastInstance` pointer used to auto-resume a session on load. Because there is no backend, the client secret is necessarily exposed in the browser — acceptable for this single-user use case but worth remembering if the scope of the app ever changes.

**Logo asset:** `assets/logo.png` is a pre-rendered transparent PNG of the word "Mastofoto" set in the Google Font "Pacifico" — it exists specifically so the page never has to load a webfont at runtime. It was generated with Pillow (`ImageFont.truetype` + `ImageDraw.text`) from the actual Pacifico TTF (fetched from `fonts.gstatic.com`), not with a browser. To regenerate it (e.g. a different color/size), re-run that kind of script rather than trying to reintroduce a `<link>` to Google Fonts.

**List configuration:** the app intentionally supports exactly one active list at a time (not a multi-list browser). `showListSetup()` fetches `/api/v1/lists` and lets the user pick one; the choice is persisted as `listId` per-instance and reused on future logins. The "Cambia lista" button re-opens the same setup screen to switch lists later.

**Timeline & photo filtering:** `loadTimeline()` fetches `/api/v1/timelines/list/:id`, paginates using the `Link: rel="next"` header (falling back to the last returned status id via `parseNextMaxId()`), and then filters results client-side with `hasPhoto()` — only statuses (or reblogs) with at least one `media_attachments` entry of type `image` are rendered. This filtering happens after pagination, so "Carica altri" may need multiple clicks to surface new photo posts if a page has none.

**Rendering & sanitization:** `renderStatusCard()` builds each post's DOM manually (no templating library). Media (`buildMediaElement()`) is always rendered before the body text — including inside content-warning posts, where both live inside the `<details>` collapse. Images/videos are shown at their original aspect ratio (`height: auto`, no cropping). Status `content` from the API is HTML and is passed through `sanitizeStatusHtml()`, a hand-rolled allowlist sanitizer (permitted tags in `ALLOWED_TAGS`; all attributes stripped except a safety-checked `href` on `<a>`, which also gets `rel`/`target` forced) rather than trusting Mastodon's server-side sanitization outright. Before attributes are stripped, the sanitizer detects Mastodon's hashtag markup (`class="...hashtag..."` or `rel="tag"`) and re-tags the link with a `tag-link` class so hashtags can be styled smaller/muted in CSS separately from regular links.

**Favourite/reblog:** `toggleFavourite()`/`toggleReblog()` call the respective `/favourite`/`unfavourite` and `/reblog`/`unreblog` endpoints and update the button label/state from the API response rather than optimistically.
