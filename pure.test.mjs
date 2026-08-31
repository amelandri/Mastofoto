import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHttpUrl, hasPhoto, parseNextMaxId } from './pure.mjs';

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
