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
- Content-warning posts collapsed behind a toggle
- Session persisted per instance in the browser

## Requirements

- A Mastodon account with at least one list already created, containing the accounts you want to follow
- A modern browser
- The app must be served from a stable `http(s)://` URL (e.g. GitHub Pages) — opening `index.html` directly as a `file://` page does not work, since Mastodon's OAuth flow (and some browsers' `fetch()` restrictions) require a real origin

## Getting started

1. Open the app at its hosted URL (e.g. `https://<username>.github.io/<repo>/`).
2. Enter your instance domain (e.g. `mastodon.uno`) and click **Connect**. You'll be redirected to your instance to approve access, then sent straight back.
3. Choose which list to use — the app remembers it for next time.
4. Browse, favourite, and boost the photo posts from that list. Use **Settings** anytime to switch lists or change the theme.

## How authentication works

Mastofoto registers itself as an OAuth app on your instance the first time you connect, then redirects you to your instance's authorization page and back to the app's own URL (whatever URL it's currently served from) once you approve. It requests only the `read`, `write:favourites`, and `write:statuses` scopes — it cannot post new statuses.

## Hosting

Since the app must be served over `http(s)://`, the simplest option is a free static host such as GitHub Pages: push this repository, then enable Pages in the repo settings (*Settings → Pages → Deploy from a branch → `main` / root*). No build step or server configuration is needed — the app adapts its OAuth redirect URL automatically to wherever it's hosted.

## Data & privacy

There is no server behind this app, so no server ever stores any of your data. Everything (app credentials, access token, chosen list) is stored only in your own browser's `localStorage`, scoped per Mastodon instance, and never leaves your machine except in requests sent directly to your chosen Mastodon instance. This is also stated as a notice on the login page. Because there's no backend, the OAuth client secret is visible in the browser — acceptable for personal use, but don't treat it as a secret.

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
