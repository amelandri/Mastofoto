# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- OAuth2 login against any Mastodon instance using the standard authorization-code redirect flow, with dynamic app registration and per-instance session persistence in `localStorage`. The redirect URL is derived automatically from wherever the app is hosted, so it requires serving the app over `http(s)://` (e.g. GitHub Pages) rather than opening `index.html` as a `file://` page.
- List configuration screen to choose which Mastodon list to follow, with a "Cambia lista" action to switch later.
- Timeline view for the selected list, filtered to show only posts (and boosts) containing photos.
- Favourite and reblog actions on each post, reflecting live counts/state from the API.
- Content-warning posts collapsed behind a toggle, with an allowlist-based HTML sanitizer for status content.

### Changed

- Post layout: media is now always rendered before the body text (including inside content-warning posts).
- Images/videos are no longer cropped to a fixed height — they scale to their original aspect ratio.
- Hashtag links inside post text are rendered smaller and in a muted color instead of the default link style.
- Each post now shows its publication date/time, right-aligned next to the author.
- Header redesigned: content width now matches the post feed, the blue background was removed in favor of a plain header with a bottom border, and the "Mastofoto" wordmark is now a static image (`assets/logo.png`) instead of a live Google Fonts dependency.
- The connected instance domain is now shown under the logo in small type, instead of next to the account buttons.
- Login and list-selection forms: the button now sits inline next to its input/select instead of stacked below it.

### Added

- A privacy notice on the login page stating that no data is stored on a server and the access token lives only in the browser's storage; documented in the README as well.
- Favicon (`assets/favicon.png`/`.ico`), generated from the "M" of the logo wordmark in the same font and color.

### Removed

- Google Fonts dependency (was loaded for the header logo's "Pacifico" typeface).
