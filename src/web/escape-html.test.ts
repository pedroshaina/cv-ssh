import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml } from './escape-html.js';

test('the five HTML-special characters are escaped', () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});
