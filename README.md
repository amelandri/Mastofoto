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

## Getting started

1. Open `index.html` in your browser (double-click, or serve the folder with a static file server such as `python3 -m http.server` if your browser blocks `fetch()` from `file://`).
2. Enter your instance domain (e.g. `mastodon.social`) and click **Connetti**.
3. Open the authorization link that appears, approve access on Mastodon, then copy the code it shows you back into the page and click **Verifica e accedi**.
4. Choose which list to use — the app remembers it for next time.
5. Browse, favourite, and boost the photo posts from that list. Use **Cambia lista** anytime to switch lists.

## How authentication works

Mastofoto registers itself as an OAuth app on your instance the first time you connect, then uses Mastodon's out-of-band (`urn:ietf:wg:oauth:2.0:oob`) flow: Mastodon displays an authorization code on screen instead of redirecting to a URL, so the app doesn't need to be hosted anywhere in particular. It requests only the `read`, `write:favourites`, and `write:statuses` scopes — it cannot post new statuses.

## Data & privacy

Everything (app credentials, access token, chosen list) is stored in your browser's `localStorage`, scoped per Mastodon instance. Nothing is sent anywhere except directly to your chosen Mastodon instance. Because there's no backend, the OAuth client secret is visible in the browser — acceptable for personal use, but don't treat it as a secret.

## Limitations

- Single list at a time — not a general-purpose Mastodon client
- No posting/composing new statuses
- Photo filtering happens client-side after fetching a page of the timeline, so **Carica altri** may need a few clicks on quiet lists
