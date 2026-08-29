# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
