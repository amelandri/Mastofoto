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

export function hasPhoto(status) {
  const original = status.reblog || status;
  return (original.media_attachments || []).some(att => att.type === 'image');
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
