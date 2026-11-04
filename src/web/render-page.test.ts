import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GOODBYE_MESSAGES } from '../cv-session/goodbye-messages.constants.js';
import type { CvView } from './cv-view.types.js';
import { escapeHtml } from './escape-html.js';
import { renderPage } from './render-page.js';

const view: CvView = {
  cols: 80,
  name: 'Ada Lovelace',
  bannerArt: ' _  \n|_| ',
  taglineHtml: '<span class="b">Analyst</span> · London',
  sections: [
    { id: 'about', title: 'About', html: 'First <span class="b">programmer</span>.' },
    { id: 'contact', title: 'Contact', html: 'ada@example.com' },
  ],
};

test('every section is in the page, with its title and rendered body', () => {
  const page = renderPage(view);
  for (const section of view.sections) {
    assert.ok(page.includes(`>${section.title}<`), section.title);
    assert.ok(page.includes(section.html), section.id);
    assert.match(page, new RegExp(`<section[^>]*id="section-${section.id}"(?![^>]*hidden)[^>]*>`));
  }
});

test('the title and preview tags come from the name and the tagline text', () => {
  const page = renderPage(view);
  assert.ok(page.includes('<title>Ada Lovelace — ssh cv.pedromartins.dev.br</title>'));
  assert.ok(page.includes('<meta property="og:title" content="Ada Lovelace — ssh cv.pedromartins.dev.br">'));
  assert.ok(page.includes('<meta name="description" content="Analyst · London">'));
  assert.ok(page.includes('<meta property="og:description" content="Analyst · London">'));
});

test('names and titles are escaped wherever they appear', () => {
  const page = renderPage({
    ...view,
    name: '<x>',
    sections: [{ id: 'a-b-c', title: 'A <b> & c', html: 'x' }],
  });
  assert.ok(!page.includes('<x>'));
  assert.ok(!page.includes('A <b> & c'));
  assert.ok(page.includes('&lt;x&gt; — ssh'));
  assert.ok(page.includes('A &lt;b&gt; &amp; c'));
});

test('the banner art is escaped and hidden from screen readers, which get the plain name', () => {
  const page = renderPage({ ...view, bannerArt: '<|>' });
  assert.ok(page.includes('<pre class="banner-art" aria-hidden="true">&lt;|&gt;</pre>'));
  assert.ok(page.includes('<h1 class="name">Ada Lovelace</h1>'));
});

test('no inline styles or scripts, so the CSP can stay strict', () => {
  const page = renderPage(view);
  assert.ok(!page.includes('style="'));
  assert.doesNotMatch(page, /<script(?![^>]*\ssrc=)[^>]*>/);
});

test('the page carries the width it was rendered at and the ssh host for the script', () => {
  const page = renderPage(view);
  assert.match(page, /<html lang="en" data-cols="80" data-ssh-host="cv.pedromartins.dev.br"/);
});

test('boot.js runs before first paint: a classic, blocking script in the head', () => {
  const page = renderPage(view);
  assert.match(page, /<head>[\s\S]*<script src="\/assets\/boot.js"><\/script>[\s\S]*<\/head>/);
});

test('app.js loads as a module, after the document is parsed', () => {
  assert.ok(renderPage(view).includes('<script type="module" src="/assets/app.js"></script>'));
});

test('the intro is an overlay hidden from screen readers, with the CV still underneath', () => {
  const page = renderPage(view);
  assert.match(page, /<div class="intro" aria-hidden="true">[\s\S]*<span class="typed"><\/span>/);
  assert.ok(page.indexOf('class="intro"') > page.indexOf('id="viewport"'));
});

test('without JavaScript the intro overlay never shows', () => {
  const stylesheet = readFileSync(new URL('../../public/style.css', import.meta.url), 'utf8');
  assert.match(stylesheet, /html:not\(\.js\) \.intro\s*\{\s*display: none;/);
});

test('the session end screen is in the page, hidden, with the SSH goodbye and the real command', () => {
  const page = renderPage(view);
  assert.match(page, /<div class="closed" hidden>/);
  assert.ok(page.includes(`<pre class="goodbye">${escapeHtml(GOODBYE_MESSAGES.quit?.trimEnd() ?? '')}</pre>`));
  assert.ok(page.includes('Connection to cv.pedromartins.dev.br closed.'));
  assert.match(page, /<button class="reconnect" type="button">Reconnect<\/button>/);
  assert.match(page, /<code class="ssh-command">ssh cv.pedromartins.dev.br<\/code>/);
  assert.match(page, /<button class="copy" type="button">Copy<\/button>/);
});
