# Mastofoto

A static web app that shows only the photo posts from one Mastodon list, letting you favourite and reblog them — no backend, no database, runs entirely in the browser.

## Features

- Login via Mastodon OAuth, with the app registering itself on your instance automatically (no server-side redirect needed)
- Configure which Mastodon list to follow, and switch it later
- Shows only posts (and boosts) that contain photos
- Favourite (⭐) and reblog (🔁) directly from the feed
- Content-warning posts collapsed behind a toggle
- Session persisted per instance in the browser

## Requirements

- A Mastodon account with at least one list already created, containing the accounts you want to follow
- A modern browser
- The app must be served from a stable `http(s)://` URL (e.g. GitHub Pages) — opening `index.html` directly as a `file://` page does not work, since Mastodon's OAuth flow (and some browsers' `fetch()` restrictions) require a real origin

## Getting started

1. Open the app at its hosted URL (e.g. `https://<username>.github.io/<repo>/`).
2. Enter your instance domain (e.g. `mastodon.social`) and click **Connetti**. You'll be redirected to your instance to approve access, then sent straight back.
3. Choose which list to use — the app remembers it for next time.
4. Browse, favourite, and boost the photo posts from that list. Use **Cambia lista** anytime to switch lists.

## How authentication works

Mastofoto registers itself as an OAuth app on your instance the first time you connect, then redirects you to your instance's authorization page and back to the app's own URL (whatever URL it's currently served from) once you approve. It requests only the `read`, `write:favourites`, and `write:statuses` scopes — it cannot post new statuses.

## Hosting

Since the app must be served over `http(s)://`, the simplest option is a free static host such as GitHub Pages: push this repository, then enable Pages in the repo settings (*Settings → Pages → Deploy from a branch → `main` / root*). No build step or server configuration is needed — the app adapts its OAuth redirect URL automatically to wherever it's hosted.

## Data & privacy

There is no server behind this app, so no server ever stores any of your data. Everything (app credentials, access token, chosen list) is stored only in your own browser's `localStorage`, scoped per Mastodon instance, and never leaves your machine except in requests sent directly to your chosen Mastodon instance. This is also stated as a notice on the login page. Because there's no backend, the OAuth client secret is visible in the browser — acceptable for personal use, but don't treat it as a secret.

## Limitations

- Single list at a time — not a general-purpose Mastodon client
- No posting/composing new statuses
- Photo filtering happens client-side after fetching a page of the timeline, so **Carica altri** may need a few clicks on quiet lists

## License

MIT — see [LICENSE](LICENSE).
