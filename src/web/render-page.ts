import type { CvSectionView, CvView } from './cv-view.types.js';
import { GOODBYE_MESSAGES } from '../cv-session/goodbye-messages.constants.js';
import { escapeHtml } from './escape-html.js';
import { SSH_HOST } from './web.constants.js';

/** The whole CV as one document: readable without JavaScript, which only adds the TUI behaviour. */
export function renderPage(view: CvView): string {
  const name = escapeHtml(view.name);
  const title = name ? `${name} — ssh ${SSH_HOST}` : `ssh ${SSH_HOST}`;
  // taglineHtml is already escaped: dropping the tags leaves attribute-safe text.
  const description = view.taglineHtml
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `<!doctype html>
<html lang="en" data-cols="${view.cols}" data-ssh-host="${SSH_HOST}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta name="theme-color" content="#0d1117">
<script src="/assets/boot.js"></script>
<link rel="stylesheet" href="/assets/style.css">
<script type="module" src="/assets/app.js"></script>
</head>
<body>
<main class="window">
<div class="titlebar"><button class="dot close" type="button" aria-label="Close session"></button><span class="dot minimize"></span><span class="dot zoom"></span><span class="window-title">visitor@web — ssh ${SSH_HOST}</span></div>
<div class="screen" id="screen" tabindex="0" aria-label="CV terminal">
<header class="banner">${renderBanner(view, name)}</header>
<nav class="tabbar" role="tablist" aria-label="Sections">${view.sections.map(renderTab).join('')}</nav>
<div class="viewport" id="viewport">
${view.sections.map(renderSection).join('\n')}
</div>
<footer class="footer"><span class="hints"></span><span class="percent"></span></footer>
<div class="live visually-hidden" aria-live="polite"></div>
${renderClosed()}
<div class="intro" aria-hidden="true"><pre><span class="prompt">visitor@web ~ %</span> <span class="typed"></span><span class="cursor">▌</span></pre><pre class="intro-status"></pre></div>
</div>
</main>
</body>
</html>
`;
}

function renderBanner(view: CvView, name: string): string {
  const art = view.bannerArt ? `<pre class="banner-art" aria-hidden="true">${escapeHtml(view.bannerArt)}</pre>` : '';
  const tagline = view.taglineHtml ? `<pre class="ansi tagline">${view.taglineHtml}</pre>` : '';
  return `${art}<h1 class="name">${name}</h1>${tagline}`;
}

function renderTab(section: CvSectionView, index: number): string {
  return `<a class="tab" role="tab" id="tab-${section.id}" href="#section-${section.id}" aria-controls="section-${section.id}" aria-selected="${index === 0}">${escapeHtml(section.title)}</a>`;
}

function renderSection(section: CvSectionView): string {
  return `<section class="panel" role="tabpanel" id="section-${section.id}" aria-labelledby="tab-${section.id}"><pre class="ansi">${section.html}</pre></section>`;
}

/** What a visitor sees after quitting: what ssh prints, then a way back and the real command. */
function renderClosed(): string {
  const goodbye = escapeHtml(GOODBYE_MESSAGES.quit?.trimEnd() ?? '');
  return `<div class="closed" hidden><pre class="goodbye">${goodbye}</pre><pre>Connection to ${SSH_HOST} closed.</pre><pre><span class="prompt">visitor@web ~ %</span> <span class="cursor">▌</span></pre><p class="come-back">If you want to go back, click Reconnect below or try it yourself:</p><div class="actions"><button class="reconnect" type="button">Reconnect</button><span class="command-copy"><code class="ssh-command">ssh ${SSH_HOST}</code><button class="copy" type="button">Copy</button></span></div></div>`;
}
