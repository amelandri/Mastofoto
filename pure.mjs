// Pure, DOM-free functions shared between app.js (loaded as a module in the
// browser) and pure.test.mjs (run with `node --test`). Kept separate from
// app.js specifically so this logic can be unit-tested without a browser —
// see CLAUDE.md for why sanitizeStatusHtml() isn't here too (it needs
// DOMParser, which Node doesn't provide without an added dependency).

export function isHttpUrl(value, base = (typeof window !== 'undefined' ? window.location.href : undefined)) {
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Renders plain text (e.g. an account's display_name, or a content-warning
// summary) that may contain Mastodon custom emoji shortcodes (":shortcode:")
// into safe HTML: everything is escaped first, then each shortcode present
// in `emojis` (the Account/Status `emojis` array Mastodon sends alongside
// that text) is replaced with an <img>. A shortcode with no matching entry,
// or whose url isn't http(s), is left as plain escaped text.
export function renderEmojiText(text, emojis, base) {
  const escaped = escapeHtml(text);
  if (!Array.isArray(emojis) || !emojis.length) return escaped;
  return emojis.reduce((result, emoji) => {
    if (!emoji || !emoji.shortcode || !emoji.url || !isHttpUrl(emoji.url, base)) return result;
    const shortcode = `:${emoji.shortcode}:`;
    if (!result.includes(shortcode)) return result;
    const img = `<img class="emoji" src="${escapeHtml(emoji.url)}" alt="${shortcode}" title="${shortcode}" loading="lazy">`;
    return result.split(shortcode).join(img);
  }, escaped);
}

// How many grid columns a multi-photo post should use: 3 when the count
// divides evenly by 3, otherwise 2. Counts that divide evenly by neither
// (e.g. 5) fall back to 2 and just end up with a shorter last row — every
// tile still gets the same column width (and, with a fixed aspect-ratio,
// the same height), so this is a plausible default rather than an attempt
// at perfectly equal rows for every possible count. Only meaningful for
// count > 1 — callers only invoke it in that case.
export function mediaGridColumns(count) {
  if (count % 3 === 0) return 3;
  if (count % 2 === 0) return 2;
  return 2;
}

export function hasPhoto(status) {
  const original = status.reblog || status;
  return (original.media_attachments || []).some(att => att.type === 'image');
}

// Parses the Profile tag filter's raw input ("#cats, #Sunset, ,#travel")
// into a clean list of lowercase tag names with no leading "#" ("cats",
// "sunset", "travel") — a status's own tags come back the same way (Status
// objects carry a `tags: [{ name, url }]` array where `name` has no "#"),
// so both sides of the comparison end up in the same shape without either
// needing special-casing. Whitespace-only/empty entries (from stray commas)
// are dropped; an empty/missing input returns [] (no filtering).
export function parseTagFilter(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map(tag => tag.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean);
}

// True if `tags` is empty (no filter set — everything matches) or `status`
// carries at least one tag in common with it (OR, not AND: matching *any*
// listed tag is enough). Assumes `status` is never a reblog wrapper — true
// for every caller today (Profile excludes boosts outright via the API's
// own exclude_reblogs=true), so this doesn't look inside `status.reblog`
// the way hasPhoto() does; revisit if it's ever reused somewhere reblogs
// can reach.
export function statusMatchesTagFilter(status, tags) {
  if (!tags.length) return true;
  const statusTags = (status.tags || []).map(tag => tag.name.toLowerCase());
  return tags.some(tag => statusTags.includes(tag));
}

export function parseNextMaxId(linkHeader, statuses) {
  if (linkHeader) {
    const match = linkHeader.split(',').find(part => part.includes('rel="next"'));
    if (match) {
      const urlMatch = match.match(/<([^>]+)>/);
      if (urlMatch) {
        const url = new URL(urlMatch[1]);
        const maxId = url.searchParams.get('max_id');
        if (maxId) return maxId;
      }
    }
  }
  if (statuses.length) return statuses[statuses.length - 1].id;
  return null;
}
