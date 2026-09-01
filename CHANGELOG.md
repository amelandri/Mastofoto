# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.5.3] - 2026-09-01

### Fixed

- Improvements to Post publishing date positioning

## [0.5.2] - 2026-09-01

### Added

- The Settings screen's timeline picker now offers "Home timeline" as an option alongside your Mastodon lists — no extra permission needed, since it's covered by the same `read` scope already requested. Choosing it skips the list-members preview (there's no "membership" to show), and it's remembered per-instance for next time just like a list choice.
- Custom emoji (`:shortcode:`) now render as actual images instead of literal text — in post text and content-warning summaries, in author display names (post header, "boosted" banner, list-members preview). Handled with the same security-conscious pattern as every other external URL in the app: each emoji's image URL is validated before use, and an unrecognized or unsafe shortcode is just left as plain text.
- On a post with multiple photos, the lightbox can now move between them: swipe left/right on touch, or use the arrow keys on a keyboard. Navigation clamps at the first/last photo rather than wrapping around.

### Changed

- The post date now shows a 2-digit year (`31/08/26` instead of `31/08/2026`).
- On mobile, the post date now sits on the same row as the author's username (right-aligned), the same layout already used on desktop, instead of wrapping onto its own full-width line below. To guarantee the username never overlaps the date now that they share a row, `.username` gets a fixed width on mobile with a fade-to-transparent effect on truncated text, instead of the usual ellipsis. The "New" badge keeps its own separate behavior: pinned to the card's top-right corner regardless of the header's content, same as before — only the date moved.
- Various Improvements to icons and text positioning

### Fixed

- Logging in failed with "crypto.randomUUID is not a function" when testing from a real phone over a plain `http://<lan-ip>:port` address instead of `http://localhost` — `crypto.randomUUID()` requires a secure context (HTTPS, or `localhost`), which a LAN IP over plain HTTP isn't. The OAuth `state` value now falls back to building a UUID from `crypto.getRandomValues()` (which has no such restriction) when `crypto.randomUUID` isn't available.

## [0.5.1] - 2026-08-31

### Fixed

- A "Load failed" timeline error stayed on screen even after a subsequent load succeeded (e.g. pulling to refresh once the connection came back), because only `selectList()` cleared it — pull-to-refresh calls `loadTimeline()` directly and skipped that step. The error is now cleared at the top of `loadTimeline()` itself, so every caller is covered.
- Reloading the page while already logged in briefly flashed the login screen before the photo feed appeared, because `login-view` was the only view visible by default in the static HTML — it stayed on screen for the moment it took `startSession()`'s network round-trip to verify the stored session and switch views. `login-view` now starts hidden like the other three views, and the bootstrap explicitly shows it only when there's actually no session to resume.

### Changed

- Improved informations about source code and selfhosting

## [0.5.0] - 2026-08-31

### Added

- **Dark theme**, switchable from a new "Theme" setting on the renamed Settings screen. Defaults to the OS/browser's `prefers-color-scheme` when no explicit choice has been saved; the pick persists in `localStorage` and applies instantly, including updating the mobile/PWA `theme-color`.
- The About/Info page is now reachable from the login screen too (previously only from the header once logged in), via a new link in the login page's short disclosure text.
- The header's info button is now always visible, including when logged out — previously it lived inside the same container as "Settings"/"Log out" and was hidden along with them until login.
- A visible close button on the photo lightbox, and full keyboard support: photos are focusable and open with Enter/Space (previously mouse/touch only), and closing the lightbox returns focus to the photo that opened it.
- A service worker (`sw.js`) caches the static app shell (HTML/CSS/JS/manifest/icons) so the app still loads when offline or on a flaky connection — network-first with cache fallback, and scoped to same-origin requests only, so it never touches Mastodon API responses.
- Photos now show a blurred placeholder (decoded from Mastodon's `blurhash` data, no library) while the full-resolution image loads, instead of empty space.
- A test suite (`pure.test.mjs`, run with `node --test` / `npm test`) covering `pure.mjs`'s functions, including a regression test for the `javascript:` URI issue fixed in 0.4.1.

### Changed

- The mobile/PWA home-screen icon (`apple-touch-icon` and `manifest.json`'s icon) now uses a new `assets/app-icon.png` instead of the plain transparent `favicon.png`: same blue "M", composited over a subtle dark diagonal gradient (`#232a32` to `#12151a`, centered on the app's own dark-theme background) so it reads as a proper opaque icon once a phone's launcher places it over an arbitrary wallpaper, rather than looking inconsistent with a transparent background. The browser-tab favicon (`favicon.ico`/`favicon.png`) is unchanged. Contrast of the "M" against the gradient was checked with the same WCAG relative-luminance formula used elsewhere (≥4.2:1 at every point).
- Updated the About/Info page and README to catch up with everything shipped since they were last written: the Features list now mentions the theme picker, PWA installability, pull-to-refresh, offline app-shell caching, and jumping to the original post; Security & data now discloses the service worker's scope (app files only, never Mastodon data) and, honestly, that some deployments (including the maintainer's own) may run basic anonymous analytics — the code in this repository carries none.
- Replaced the login page's long bulleted "Some info about Mastofoto" disclosure with a short sentence and a link to the Info page for the full detail.
- The header's "Settings", "Log out", and info buttons no longer look like buttons (no background/border) — restyled as colored text links with an underline on hover, using the same `--link` blue as other links. They're still real `<button>` elements under the hood (kept for native keyboard support), just visually plain-link. The link color's contrast was checked without the previous opacity dimming, since that alone was enough to drop it back under 4.5:1 in light mode.
- Renamed "List Management" to "Settings", reorganizing the screen into a "List" section (unchanged content) and a new "Appearance" section (the theme picker).
- Every remaining color in `style.css` (brand blue, button text, card shadows, the lightbox overlay) moved into the light/dark CSS variables, so none are hardcoded outside the two `:root` palette blocks.
- Redesigned the "New" badge and timestamp on desktop: instead of sharing one line pushed to the right, they now stack in a right-aligned column, with the badge vertically lined up with the author's name and the date with their handle.
- On mobile, the "New" badge no longer sits inline with the wrapped date — it's now pinned to the top-right corner of the post card, while the date stays under the author info as before.
- Added explicit `aria-label`s to the "List Management" and "Log out" header buttons, matching the existing info button, so screen readers announce them correctly once their text labels collapse to icon-only on mobile.
- `isHttpUrl`, `hasPhoto`, and `parseNextMaxId` moved out of `app.js` into a new `pure.mjs` module, with `app.js` now loaded as `<script type="module">` importing them. A minimal `package.json` (`"type": "module"`, no dependencies) was added so Node resolves the same `import` for testing.
- Replaced every emoji icon (header Settings/Info/Log out, and the feed's Favourite/Reblog/View post buttons and "boosted" banner) with small inline flat SVG icons using `stroke="currentColor"`/`fill="currentColor"`, so they automatically pick up the surrounding text color — including the active/pressed state on the favourite and reblog buttons, and both themes — without needing separate light/dark image assets. Being inline markup rather than image files, they add effectively no extra page weight. Removed the now-unused `.icon-btn` CSS rules left over from the header buttons' earlier emoji-based styling.

### Fixed

- Logging out while viewing the About/Info page left it visible behind the login form, since the logout handler never hid it — every view-switching handler now goes through a single `showView()` helper that always hides all four views before showing one, so this whole class of "forgot to hide X" bug can't recur.
- Renamed the login page's `.privacy-note` div to `.app-disclosure` — the old name matched generic cosmetic-filtering rules used by some content/ad blockers (notably on iOS Safari), which hid the whole section even though it's not a cookie/tracking notice at all.

### Accessibility

- Found and fixed several real WCAG contrast failures (measured, not eyeballed): `--text-tertiary` (2.85:1 in light mode), `--border-strong` on inputs/buttons (1.55:1), and white text on `--accent-active` (2.27:1) all fell short of the required 4.5:1 (text) / 3:1 (UI components) — all three now pass in both themes.
- Added a visually-hidden `<h1>Mastofoto</h1>` in the header, giving every view a proper heading hierarchy starting from one `<h1>` (previously the page had none — headings jumped straight to `<h2>`).
- `#list-select` had no accessible name at all (the "List" heading nearby isn't programmatically associated with it) — added a visually-hidden `<label>`.
- The Favourite/Reblog buttons briefly had an `aria-label` ("Favourite"/"Reblog") added alongside their new SVG icons, which overrides an element's whole accessible name and so silently dropped the visible count from what's announced to screen readers. Replaced with a visually-hidden `.sr-only` label next to the visible count instead, so the announced name is "Favourite, 5" rather than just "Favourite".
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
