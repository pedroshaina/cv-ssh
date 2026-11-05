import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CvContent } from '../content/content.types.js';
import { renderBanner } from '../ui/rendering/render-banner.js';
import { renderMarkdown } from '../ui/rendering/render-markdown.js';
import { textWidthFor } from '../ui/rendering/text-width.js';
import { ansiToHtml } from './ansi-to-html.js';
import { renderCvView } from './render-cv-view.js';

const content: CvContent = {
  header: { name: 'Ada', tagline: '**Analyst** · London' },
  sections: [
    { title: 'About', markdown: '## About\n\nSome **bold** text that is long enough to wrap at a narrow width.' },
    { title: 'Side projects', markdown: '- one\n- two' },
  ],
};

test('sections and tagline are the TUI rendering, as HTML', () => {
  const view = renderCvView(content, 50);
  assert.equal(view.cols, 50);
  assert.equal(view.taglineHtml, ansiToHtml(renderMarkdown('**Analyst** · London', textWidthFor(50))));
  assert.deepEqual(
    view.sections.map((section) => section.html),
    content.sections.map((section) => ansiToHtml(renderMarkdown(section.markdown, textWidthFor(50)))),
  );
});

test('the banner uses the TUI rule: width minus the side padding', () => {
  assert.equal(renderCvView(content, 50).bannerArt, renderBanner('Ada', 46) ?? null);
  assert.equal(renderCvView(content, 24).bannerArt, renderBanner('Ada', 20) ?? null);
});

test('sections get ids from their titles', () => {
  const view = renderCvView(content, 80);
  assert.deepEqual(
    view.sections.map(({ id, title }) => ({ id, title })),
    [
      { id: 'about', title: 'About' },
      { id: 'side-projects', title: 'Side projects' },
    ],
  );
});

test('no header gives an empty name and no banner', () => {
  const view = renderCvView({ sections: content.sections }, 80);
  assert.equal(view.name, '');
  assert.equal(view.bannerArt, null);
  assert.equal(view.taglineHtml, '');
});
