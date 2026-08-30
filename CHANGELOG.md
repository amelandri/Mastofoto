# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- The header's "Settings", "Log out", and info buttons no longer look like buttons (no background/border) — restyled as colored text links with an underline on hover, using the same `--link` blue as other links. They're still real `<button>` elements under the hood (kept for native keyboard support), just visually plain-link. The link color's contrast was checked without the previous opacity dimming, since that alone was enough to drop it back under 4.5:1 in light mode.

### Fixed

- Renamed the login page's `.privacy-note` div to `.app-disclosure` — the old name matched generic cosmetic-filtering rules used by some content/ad blockers (notably on iOS Safari), which hid the whole section even though it's not a cookie/tracking notice at all.

### Added

- Dark theme (background `#191d20`), switchable from a new "Theme" setting on the renamed Settings screen. Defaults to the OS/browser's `prefers-color-scheme` when no explicit choice has been saved; the pick persists in `localStorage` and applies instantly, including updating the mobile/PWA `theme-color`.
- A visible close button on the photo lightbox, and full keyboard support: photos are focusable and open with Enter/Space (previously mouse/touch only), and closing the lightbox returns focus to the photo that opened it.
- A service worker (`sw.js`) caches the static app shell (HTML/CSS/JS/manifest/icons) so the app still loads when offline or on a flaky connection — network-first with cache fallback, and scoped to same-origin requests only, so it never touches Mastodon API responses.
- Photos now show a blurred placeholder (decoded from Mastodon's `blurhash` data, no library) while the full-resolution image loads, instead of empty space.
- A test suite (`pure.test.mjs`, run with `node --test` / `npm test`) covering `pure.mjs`'s functions, including a regression test for the `javascript:` URI issue fixed in 0.4.1.

### Changed

- Renamed "List Management" to "Settings", reorganizing the screen into a "List" section (unchanged content) and a new "Appearance" section (the theme picker).
- Every remaining color in `style.css` (brand blue, button text, card shadows, the lightbox overlay) moved into the light/dark CSS variables, so none are hardcoded outside the two `:root` palette blocks.
- Redesigned the "New" badge and timestamp on desktop: instead of sharing one line pushed to the right, they now stack in a right-aligned column, with the badge vertically lined up with the author's name and the date with their handle.
- On mobile, the "New" badge no longer sits inline with the wrapped date — it's now pinned to the top-right corner of the post card, while the date stays under the author info as before.
- Added explicit `aria-label`s to the "List Management" and "Log out" header buttons, matching the existing info button, so screen readers announce them correctly once their text labels collapse to icon-only on mobile.
- `isHttpUrl`, `hasPhoto`, and `parseNextMaxId` moved out of `app.js` into a new `pure.mjs` module, with `app.js` now loaded as `<script type="module">` importing them. A minimal `package.json` (`"type": "module"`, no dependencies) was added so Node resolves the same `import` for testing.

### Accessibility

- Found and fixed several real WCAG contrast failures (measured, not eyeballed): `--text-tertiary` (2.85:1 in light mode), `--border-strong` on inputs/buttons (1.55:1), and white text on `--accent-active` (2.27:1) all fell short of the required 4.5:1 (text) / 3:1 (UI components) — all three now pass in both themes.
- Added a visually-hidden `<h1>Mastofoto</h1>` in the header, giving every view a proper heading hierarchy starting from one `<h1>` (previously the page had none — headings jumped straight to `<h2>`).
- `#list-select` had no accessible name at all (the "List" heading nearby isn't programmatically associated with it) — added a visually-hidden `<label>`.
- Photo images lacking an author-provided description now get a fallback `alt` ("Photo without a description") instead of an empty one, so screen readers announce that a photo exists rather than skipping it entirely.
- Error/status messages (`#login-error`, `#list-setup-error`, `#timeline-error`, `#no-list-message`) now use `role="alert"`/`aria-live="polite"` so they're announced automatically instead of requiring the user to find them manually.
- The lightbox now has `role="dialog"`/`aria-modal="true"`, and moves focus to its close button on open and back to the triggering photo on close.
- Split the brand blue from an accessible one: `#2b90d9` measured only ~3.45:1 as text/button-label color, so it's now reserved for non-text branding (the logo/favicon/`theme-color`) only. Links use a new `--link` token (`#1a6699` light / `#5aa9e6` dark — brighter in dark mode since a link's background is the page surface, which changes per theme), and solid buttons/the "New" badge/the active favourite-reblog state use `--btn-primary-bg` (`#1c69a0`, same in both themes since a button's own fill is its immediate background regardless of page theme). Both pass 4.5:1+ with their paired text color.


## [0.4.1] - 2026-08-29

### Security

- The avatar and display-name links on each post (added after 0.3's profile-link feature) only HTML-escaped `account.url`, unlike the existing `@username` link — a remote account could set a `javascript:` URI as its profile URL and get it executed when a viewer clicked the avatar or name. All three profile links now share one `isHttpUrl()` scheme check.

## [0.4.0] - 2026-08-29

### Added

- Pull-to-refresh on the timeline: dragging down from the top of the feed reloads the current list. Implemented natively (touch events + CSS, no library), since standalone/home-screen mode on iOS and Android has no built-in reload gesture the way a regular browser tab does.

### Fixed

- On mobile, every post's wrapped timestamp used `flex-basis: 100%` together with `margin-left: 50px` to indent it under the author info — the margin added on top of the already-100%-wide box pushed each post 50px past the edge of the screen, forcing the whole page to scroll horizontally. Switched to `padding-left` (included in the width under `box-sizing: border-box`) so the indent no longer adds extra width.

## [0.3.3] - 2026-08-28

Several mobile-experience improvements, refining the responsive work started in 0.3.2.

### Changed

- On narrow (mobile) viewports, the post timestamp now wraps onto its own line below the author's name/username instead of sharing the top row, indented to align under the author info.
- Reduced header and content padding on narrow viewports, and tightened the spacing between post cards, so more of the feed fits on a phone screen.
- All mobile-specific styling was consolidated into a single `@media (max-width: 480px)` block at the end of `style.css`, instead of being spread across the file.

## [0.3.2] - 2026-08-28

### Added

- A web app manifest (`manifest.json`) plus `apple-touch-icon`/`theme-color` tags, so the existing favicon PNG is used as the home-screen icon when the app is installed/added to the home screen on mobile.

### Changed

- On narrow (mobile) viewports, the "List Management" and "Log out" buttons collapse to icon-only circular buttons (matching the existing info button style), hiding their text labels to save header space.
- Reworded the login and About page descriptions to make explicit that Mastofoto shows the posts of a Mastodon **list** and filters out anything that isn't a **photo** post — user feedback showed the previous, more abstract wording ("distraction-free photo feed") didn't convey either point clearly.
- The login page's privacy note is now the same bulleted "Security & data" list shown on the About page (including the open-source/GitHub mention), instead of a shorter standalone paragraph.

### Fixed

- On narrow screens, a long display name or username in a post header could force the row wider than the card, pushing the timestamp outside the post box. The author block now shrinks and truncates with an ellipsis instead, keeping the date always visible.

## [0.3.1] - 2026-08-28

### Added

- A "Security & data" section on the "About Mastofoto" page, summarizing in plain language: no server/no data collection, per-instance local-storage-only credentials, the OAuth `state` CSRF protection, the limited read/favourite/reblog scope, content sanitization, HTTPS + CSP, and the client-secret-in-browser caveat inherent to a backend-less app.
- The app version number is now displayed on the "About Mastofoto" page, sourced from a single `APP_VERSION` constant in `app.js`.

## [0.3.0] - 2026-08-28

### Added

- The list-selection screen now shows the members of the currently selected list, alphabetically by display name, refreshing as you change the dropdown. Each member's name links to their profile, and the list is shown in full without its own scroll area.
- Added a "Home Page" link next to the list-selection heading, right-aligned, pointing back to the app's own root regardless of where it's hosted.
- Added an "i" info button next to "Log out", opening a dedicated "About Mastofoto" page (same layout as list selection) with an app overview, feature list, and a link to the open-source GitHub repository (MIT license).

### Changed

- README now leads with a note that the project is built through "vibe coding" (conversational, AI-assisted development), and its remaining Italian button labels (leftover from before the UI translation) were corrected to match the current English UI.
- Renamed the "Change list" button to "List Management"; README's feature list and instructions updated to match, and expanded to mention list member previews, full-resolution photos, the lightbox, and the "View post" link.

## [0.2.1] - 2026-08-28

### Changed

- The avatar and display name are now also clickable links to the author's profile, matching the existing `@username` link.
- The "New" badge moved next to the timestamp (inside `.status-date`) instead of being pushed to the far right of the header on its own; its shape was also refined (smaller border-radius, adjusted padding).
- The "New" highlight no longer tints the whole post card (removed background/left-border color) — it's now indicated by the badge alone.
- The header logo is no longer wrapped in a link back to the homepage.
- The "Change list"/"Log out" buttons are more subdued by default (lower opacity), becoming more visible on hover.

## [0.2.0] - 2026-08-28

### Added

- New posts (per list, since the previous visit to that list) are now highlighted with a "New" badge and a left accent border, based on a per-list "last seen" marker stored in `localStorage`.
- The author's username on each post now links to their profile on its origin Mastodon instance, opening in a new tab.
- Added a "View post" link next to the favourite/reblog buttons, opening the original post on its origin instance in a new tab.

### Changed

- Translated all UI text to English (labels, buttons, error messages); `<html lang>` updated accordingly.
- Added a catchier introductory blurb on the login page explaining what the app does, above the connect form.
- Post dates now format with the `en-GB` locale instead of the leftover `it-IT` one, matching the rest of the translated UI.

## [0.1.0] - 2026-08-28

### Added

- OAuth2 login against any Mastodon instance using the standard authorization-code redirect flow, with dynamic app registration and per-instance session persistence in `localStorage`. The redirect URL is derived automatically from wherever the app is hosted, so it requires serving the app over `http(s)://` (e.g. GitHub Pages) rather than opening `index.html` as a `file://` page.
- List configuration screen to choose which Mastodon list to follow, with a "Cambia lista" action to switch later.
- Timeline view for the selected list, filtered to show only posts (and boosts) containing photos.
- Favourite and reblog actions on each post, reflecting live counts/state from the API.
- Content-warning posts collapsed behind a toggle, with an allowlist-based HTML sanitizer for status content.
- A privacy notice on the login page stating that no data is stored on a server and the access token lives only in the browser's storage; documented in the README as well.
- Favicon (`assets/favicon.png`/`.ico`), generated from the "M" of the logo wordmark in the same font and color.
- Click a photo to open it full-size in a lightbox overlay; click anywhere on the overlay or press Escape to close it.

### Changed

- Post layout: media is now always rendered before the body text (including inside content-warning posts).
- Images/videos are no longer cropped to a fixed height — they scale to their original aspect ratio.
- Photos now load at full resolution (`media_attachments[].url`) instead of Mastodon's ~400px-wide preview thumbnail (`preview_url`), which was being used as the primary image source; images are lazy-loaded (`loading="lazy"`) to offset the larger file sizes.
- Hashtag links inside post text are rendered smaller and in a muted color instead of the default link style.
- Each post now shows its publication date/time, right-aligned next to the author.
- Header redesigned: content width now matches the post feed, the blue background was removed in favor of a plain header with a bottom border, and the "Mastofoto" wordmark is now a static image (`assets/logo.png`) instead of a live Google Fonts dependency.
- The connected instance domain is now shown under the logo in small type, instead of next to the account buttons.
- Login and list-selection forms: the button now sits inline next to its input/select instead of stacked below it.

### Security

- OAuth login now uses a random `state` parameter, verified on the redirect callback against the value stored before leaving for the instance's authorization page — closes a login-CSRF gap where a stale pending login could be completed with an authorization code the user never approved.
- Link sanitization in post content switched from blocking only `javascript:` URLs to allowlisting `http:`/`https:` only, closing off other potentially dangerous URL schemes.
- Added a `Content-Security-Policy` meta tag (`script-src 'self'`, `object-src 'none'`, `form-action 'none'`, etc.) as defense-in-depth against script injection, since the app has no server to send real CSP/security headers.

### Removed

- Google Fonts dependency (was loaded for the header logo's "Pacifico" typeface).
