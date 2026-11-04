// The TUI's behaviour on top of the server-rendered page: one section at a time, its keys,
// clickable tabs, and the text re-rendered for this window's width.
import { columnsFor } from './columns.js';
import { actionForKey } from './key-map.js';

/** @typedef {import('./key-map.js').Action} Action */
/** @typedef {{ id: string, title: string, html: string }} CvSectionView */
/** @typedef {{ cols: number, name: string, bannerArt: string | null, taglineHtml: string, sections: CvSectionView[] }} CvView */

const KEY_HINTS = '←/→ sections · ↑/↓ scroll · space/b page · q quit';
const RESIZE_DEBOUNCE_MS = 150;

const root = document.documentElement;
const screen = /** @type {HTMLElement} */ (document.getElementById('screen'));
const viewport = /** @type {HTMLElement} */ (document.getElementById('viewport'));
const banner = /** @type {HTMLElement} */ (document.querySelector('.banner'));
const hints = /** @type {HTMLElement} */ (document.querySelector('.hints'));
const percent = /** @type {HTMLElement} */ (document.querySelector('.percent'));
const live = /** @type {HTMLElement} */ (document.querySelector('.live'));
const tabs = /** @type {HTMLAnchorElement[]} */ ([...document.querySelectorAll('.tab')]);
const panels = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.panel')]);
const isCoarsePointer = matchMedia('(pointer: coarse)').matches;

let activeIndex = 0;

/** @param {number} index */
function showSection(index) {
  const sectionCount = panels.length;
  if (sectionCount === 0) return;
  activeIndex = ((index % sectionCount) + sectionCount) % sectionCount;
  panels.forEach((panel, panelIndex) => (panel.hidden = panelIndex !== activeIndex));
  tabs.forEach((tab, tabIndex) => {
    tab.setAttribute('aria-selected', String(tabIndex === activeIndex));
    tab.tabIndex = tabIndex === activeIndex ? 0 : -1;
  });
  viewport.scrollTop = 0;
  history.replaceState(null, '', `#${panels[activeIndex]?.id ?? ''}`);
  live.textContent = `${tabs[activeIndex]?.textContent ?? ''} section`;
  updatePercent();
}

function lineHeight() {
  return parseFloat(getComputedStyle(viewport).lineHeight) || 20;
}

/** @param {Action} action */
function runAction(action) {
  switch (action.type) {
    case 'section':
      showSection(activeIndex + action.delta);
      break;
    case 'jump':
      showSection(action.index);
      break;
    case 'scroll':
      viewport.scrollTop += action.lines * lineHeight();
      break;
    case 'page':
      viewport.scrollTop += action.direction * Math.max(lineHeight(), viewport.clientHeight - 2 * lineHeight());
      break;
    case 'top':
      viewport.scrollTop = 0;
      break;
    case 'bottom':
      viewport.scrollTop = viewport.scrollHeight;
      break;
    case 'quit':
      // The session end screen arrives with the quit task.
      break;
  }
}

function updatePercent() {
  const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
  percent.textContent = maxScrollTop > 1 ? `${Math.round((viewport.scrollTop / maxScrollTop) * 100)}%` : '';
}

/** Buttons and links other than the tabs keep their own keys (Tab, Space, Enter). */
function focusIsOnControl() {
  const focused = document.activeElement;
  return focused instanceof HTMLElement && focused.matches('button, a') && !focused.matches('.tab');
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) return;
  const focusOnControl = focusIsOnControl();
  if (focusOnControl && (event.key === ' ' || event.key === 'Enter')) return;
  const action = actionForKey(event, {
    sectionCount: panels.length,
    hasSelection: (getSelection()?.toString() ?? '') !== '',
    focusOnControl,
  });
  if (!action) return;
  event.preventDefault();
  runAction(action);
});

tabs.forEach((tab, tabIndex) =>
  tab.addEventListener('click', (event) => {
    event.preventDefault();
    showSection(tabIndex);
  }),
);

viewport.addEventListener('scroll', updatePercent, { passive: true });

// Width: the server renders for a terminal as wide as the viewport, in this font's character cells.
// The panels' side padding is 2ch each, the same 4 columns the server takes off for the text.

const probe = document.createElement('span');
probe.className = 'probe';
probe.setAttribute('aria-hidden', 'true');
probe.textContent = '0123456789';
viewport.append(probe);

let renderedColumns = Number(root.dataset.cols);
let requestSequence = 0;

async function renderForWidth() {
  const columns = columnsFor(viewport.clientWidth, probe.getBoundingClientRect().width / 10);
  if (columns <= 0 || columns === renderedColumns) return;
  const sequence = ++requestSequence;
  try {
    const response = await fetch(`/cv.json?cols=${columns}`);
    if (!response.ok) return;
    const view = /** @type {CvView} */ (await response.json());
    if (sequence !== requestSequence) return;
    rerender(view);
    renderedColumns = columns;
  } catch {
    // Offline or the server is restarting: the current render stays, it is still the CV.
  }
}

/** @param {CvView} view */
function rerender(view) {
  const scrollRatio = viewport.scrollHeight > 0 ? viewport.scrollTop / viewport.scrollHeight : 0;

  let art = banner.querySelector('.banner-art');
  if (view.bannerArt) {
    if (!art) {
      art = document.createElement('pre');
      art.className = 'banner-art';
      art.setAttribute('aria-hidden', 'true');
      banner.prepend(art);
    }
    art.textContent = view.bannerArt;
  } else {
    art?.remove();
  }
  const tagline = banner.querySelector('.tagline');
  // Server-rendered from the CV's own Markdown and escaped there (ansiToHtml).
  if (tagline) tagline.innerHTML = view.taglineHtml;
  for (const section of view.sections) {
    const body = document.getElementById(`section-${section.id}`)?.querySelector('.ansi');
    if (body) body.innerHTML = section.html;
  }
  root.dataset.cols = String(view.cols);

  viewport.scrollTop = scrollRatio * viewport.scrollHeight;
  updatePercent();
}

let resizeTimer = 0;
addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => void renderForWidth(), RESIZE_DEBOUNCE_MS);
});

// Start

hints.textContent = KEY_HINTS;
const linkedIndex = panels.findIndex((panel) => `#${panel.id}` === location.hash);
showSection(linkedIndex >= 0 ? linkedIndex : 0);
live.textContent = '';
if (!isCoarsePointer) screen.focus({ preventScroll: true });
void document.fonts.ready.then(renderForWidth);
