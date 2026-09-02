import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHttpUrl, hasPhoto, parseNextMaxId, escapeHtml, renderEmojiText, mediaGridColumns } from './pure.mjs';

test('isHttpUrl accepts http(s) URLs', () => {
  assert.equal(isHttpUrl('https://example.com/foo'), true);
  assert.equal(isHttpUrl('http://example.com'), true);
});

test('isHttpUrl rejects javascript: URIs (regression: this was the XSS in v0.4.1)', () => {
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('  javascript:alert(1)'), false);
  assert.equal(isHttpUrl('JaVaScRiPt:alert(1)'), false);
});

test('isHttpUrl rejects other non-http schemes', () => {
  assert.equal(isHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isHttpUrl('ftp://example.com'), false);
  assert.equal(isHttpUrl('mailto:someone@example.com'), false);
});

test('isHttpUrl rejects malformed or empty input instead of throwing', () => {
  assert.equal(isHttpUrl(''), false);
  assert.equal(isHttpUrl('not a url'), false);
  assert.equal(isHttpUrl(undefined), false);
});

test('hasPhoto is true only for statuses with an image attachment', () => {
  assert.equal(hasPhoto({ media_attachments: [{ type: 'image' }] }), true);
  assert.equal(hasPhoto({ media_attachments: [{ type: 'video' }] }), false);
  assert.equal(hasPhoto({ media_attachments: [] }), false);
  assert.equal(hasPhoto({}), false);
});

test('hasPhoto looks at the original status inside a reblog, not the wrapper', () => {
  const boosted = {
    media_attachments: [],
    reblog: { media_attachments: [{ type: 'image' }] },
  };
  assert.equal(hasPhoto(boosted), true);
});

test('parseNextMaxId reads max_id from a Link header with rel="next"', () => {
  const link = '<https://example.com/api/v1/timelines/list/1?max_id=100>; rel="next", <https://example.com/api/v1/timelines/list/1?min_id=200>; rel="prev"';
  assert.equal(parseNextMaxId(link, []), '100');
});

test('parseNextMaxId falls back to the last status id when there is no next Link', () => {
  const statuses = [{ id: '5' }, { id: '3' }, { id: '1' }];
  assert.equal(parseNextMaxId(null, statuses), '1');
  assert.equal(parseNextMaxId('<https://example.com/x>; rel="prev"', statuses), '1');
});

test('parseNextMaxId returns null when there is nothing to page from', () => {
  assert.equal(parseNextMaxId(null, []), null);
});

test('escapeHtml escapes all five special characters', () => {
  assert.equal(escapeHtml(`<script>alert("x") & 'y'</script>`), '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;');
});

test('renderEmojiText replaces a known shortcode with an <img>, leaving the rest escaped', () => {
  const emojis = [{ shortcode: 'verified_breze', url: 'https://instance.example/emoji/breze.png' }];
  const html = renderEmojiText('<b>Bakery</b> :verified_breze: HQ', emojis);
  assert.equal(
    html,
    '&lt;b&gt;Bakery&lt;/b&gt; <img class="emoji" src="https://instance.example/emoji/breze.png" alt=":verified_breze:" title=":verified_breze:" loading="lazy"> HQ'
  );
});

test('renderEmojiText leaves an unknown shortcode as plain escaped text', () => {
  assert.equal(renderEmojiText('hello :not_a_real_emoji:', []), 'hello :not_a_real_emoji:');
});

test('renderEmojiText ignores an emoji entry with a non-http(s) url (regression guard)', () => {
  const emojis = [{ shortcode: 'evil', url: 'javascript:alert(1)' }];
  assert.equal(renderEmojiText(':evil:', emojis), ':evil:');
});

test('mediaGridColumns uses 3 columns when the count divides evenly by 3', () => {
  assert.equal(mediaGridColumns(3), 3);
  assert.equal(mediaGridColumns(6), 3);
});

test('mediaGridColumns uses 2 columns when the count divides evenly by 2', () => {
  assert.equal(mediaGridColumns(2), 2);
  assert.equal(mediaGridColumns(4), 2);
});

test('mediaGridColumns falls back to 2 columns for a count divisible by neither (e.g. 5)', () => {
  assert.equal(mediaGridColumns(5), 2);
  assert.equal(mediaGridColumns(7), 2);
});
