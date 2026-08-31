# Mastofoto

A static web app that shows only the photo posts from one Mastodon list, letting you favourite and reblog them — no backend, no database, runs entirely in the browser.

> **Built with vibe coding.** This project is developed almost entirely through conversational, natural-language prompting with an AI coding assistant (Claude Code) rather than traditional hand-written development. Features, fixes, and refactors are driven by iterative requests rather than a fixed upfront design — keep that in mind if you're reading the code, reviewing a change, or reporting an issue.

## Features

- Login via Mastodon OAuth, with the app registering itself on your instance automatically (no server-side redirect needed)
- Configure which Mastodon list to follow, preview its members, and switch it later
- Shows only posts (and boosts) that contain photos, at full resolution, with a click-to-enlarge lightbox
- Favourite (⭐), reblog (🔁), and jump to the original post directly from the feed
- New posts highlighted since your last visit
- Light and dark theme, switchable in Settings
- Installable on your phone's home screen, with pull-to-refresh and offline access to the app itself (a service worker caches the app's own files, never your Mastodon data)
- Content-warning posts collapsed behind a toggle
- Session persisted per instance in the browser

## Requirements

- A Mastodon account with at least one list already created, containing the accounts you want to follow
- A modern browser
- The app must be served from a stable `http(s)://` URL — opening `index.html` directly as a `file://` page does not work, since Mastodon's OAuth flow (and some browsers' `fetch()` restrictions) require a real origin. There is no build step and no dependencies to install; you just need somewhere to serve the static files from. Two common options, both covered below:
  - **GitHub Pages** — free, no server of your own to maintain, requires forking this repo
  - **Self-hosted** — any static web server you already control

## Getting started

Pick one hosting route, then jump to [Using the app](#using-the-app) once it's live.

### Option A — GitHub Pages (fork this repo)

1. **Fork** this repository to your own GitHub account (button top-right on the repo page).
2. **Deal with the `CNAME` file before enabling Pages.** This repo ships a root-level `CNAME` file pointing at the maintainer's own domain (`mastofoto.melandri.net`) — it's what makes *their* deployment reachable at that custom address instead of a `github.io` URL. Your fork inherits this file as-is, and you don't own that domain, so:
   - **Delete `CNAME`** if you just want the default address — your fork will then be served at `https://<your-username>.github.io/<repo>/`. This is the right choice for almost everyone.
   - **Replace its single line** with a domain of your own, only if you actually have one and have already pointed it at GitHub Pages via a DNS `CNAME`/`ALIAS` record.

   Leaving the maintainer's domain in place doesn't stop your fork's default `github.io` URL from working, but *Settings → Pages* will keep trying to verify a domain you don't control — it'll show as unverified/failing and can block enabling "Enforce HTTPS".
3. In your fork: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then pick the branch you want live (`main`) and `/ (root)`, and save.
4. Wait a minute for the first build; the live URL appears at the top of that same Settings → Pages screen once it's ready (your `github.io` URL, or your own domain if you set one up in step 2).
5. Open that URL in a browser.

### Option B — Self-hosted (your own server)

1. Get the files onto a machine you control — clone the repo (or download/copy `index.html`, `style.css`, `app.js`, `pure.mjs`, `sw.js`, `manifest.json`, and `assets/`). No build step, no `npm install` needed.
2. Serve that directory with any static file server, over `http(s)://`. A few examples:
   - Quick local testing: `python3 -m http.server` from inside the folder, then open `http://localhost:8000/`.
   - A real server: any web server capable of serving static files (nginx, Apache, Caddy, etc.) pointed at the folder.
3. Use HTTPS for anything beyond local testing — most Mastodon instances and browsers expect it (e.g. via a reverse proxy like Caddy or nginx+certbot). There's no `CNAME`-style gotcha here (that's GitHub Pages-specific); just make sure the URL you settle on is one you intend to keep using, since [how authentication works](#how-authentication-works) below ties your login to that exact origin.
4. Open that URL in a browser.

## Using the app

1. Open the app at its hosted URL (from either option above).
2. Enter your instance domain (e.g. `mastodon.uno`) and click **Connect**. You'll be redirected to your instance to approve access, then sent straight back.
3. Choose which list to use — the app remembers it for next time.
4. Browse, favourite, and boost the photo posts from that list. Use **Settings** anytime to switch lists or change the theme.

## How authentication works

Mastofoto registers itself as an OAuth app on your instance the first time you connect, then redirects you to your instance's authorization page and back to the app's own URL (whatever URL it's currently served from) once you approve. It requests only the `read`, `write:favourites`, and `write:statuses` scopes — it cannot post new statuses.

Because the app registers itself against the exact URL it's served from, changing that URL later (a different domain, adding/removing the `CNAME`, moving from `github.io` to a custom domain, switching self-hosting providers, etc.) invalidates the previous registration — you'll need to log in again from the new URL.

## Data & privacy

There is no server behind this app, so no server ever stores any of your data. Everything (app credentials, access token, chosen list) is stored only in your own browser's `localStorage`, scoped per Mastodon instance, and never leaves your machine except in requests sent directly to your chosen Mastodon instance. This is also stated as a notice on the login page. Because there's no backend, the OAuth client secret is visible in the browser — acceptable for personal use, but don't treat it as a secret.

Some deployments of Mastofoto (including the maintainer's own) may run basic, privacy-friendly analytics (e.g. Umami) to see approximate visit counts. This only records anonymous page views, never anything from your Mastodon account or activity — and the code in this repository, as described here, carries none of it.

## Accessibility

- Full keyboard support: photos can be focused and opened (Enter/Space) without a mouse, and the lightbox moves focus to its close button on open and back to the triggering photo on close.
- Screen reader friendly: a proper heading structure (one `<h1>` per page), labeled form controls, and `aria-live`/`role="alert"` regions so errors and status messages are announced automatically instead of requiring the user to go looking for them. Photos without an author-provided description get a fallback alt text rather than being silently skipped.
- Color contrast checked against WCAG AA by computing actual contrast ratios (not eyeballed) for every text/background/border pairing, in both the light and dark theme. The one deliberate exception is the brand blue on the logo/favicon, which is decorative and not used anywhere as text or button-label color for exactly this reason — everywhere text appears, a separate, verified-accessible blue is used instead.
- This hasn't been tested end-to-end with real assistive technology (a screen reader, a switch device, etc.) — the above is based on semantic markup and computed contrast, not a full manual audit. Issue reports from real-world usage are welcome.

## Limitations

- Single list at a time — not a general-purpose Mastodon client
- No posting/composing new statuses
- Photo filtering happens client-side after fetching a page of the timeline, so **Load more** may need a few clicks on quiet lists

## License

MIT — see [LICENSE](LICENSE).
