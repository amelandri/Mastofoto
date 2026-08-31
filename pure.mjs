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
