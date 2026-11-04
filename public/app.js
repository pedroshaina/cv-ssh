// The TUI's behaviour on top of the server-rendered page: one section at a time, its keys,
// clickable tabs, and the text re-rendered for this window's width.
import { columnsFor } from './columns.js';
import { playIntro } from './intro.js';
import { actionForKey } from './key-map.js';
import { swipeDelta } from './swipe.js';

/** @typedef {import('./key-map.js').Action} Action */
/** @typedef {{ id: string, title: string, html: string }} CvSectionView */
/** @typedef {{ cols: number, name: string, bannerArt: string | null, taglineHtml: string, sections: CvSectionView[] }} CvView */

const KEY_HINTS = '←/→ sections · ↑/↓ scroll · space/b page · q quit';
const TOUCH_HINTS = 'tap tabs · swipe sections · drag to scroll';
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
const intro = /** @type {HTMLElement} */ (document.querySelector('.intro'));
const closed = /** @type {HTMLElement} */ (document.querySelector('.closed'));
const goodbye = /** @type {HTMLElement} */ (document.querySelector('.goodbye'));
const reconnectButton = /** @type {HTMLButtonElement} */ (document.querySelector('.reconnect'));
const copyButton = /** @type {HTMLButtonElement} */ (document.querySelector('.copy'));
const sshCommand = /** @type {HTMLElement} */ (document.querySelector('.ssh-command'));
const closeButton = /** @type {HTMLButtonElement} */ (document.querySelector('.close'));
const isCoarsePointer = matchMedia('(pointer: coarse)').matches;
const sshHost = root.dataset.sshHost ?? '';

let activeIndex = 0;
/** @type {{ skip(): void } | undefined} */
let runningIntro;

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
      endSession();
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
  // After quitting, only the end screen's own buttons respond, with their usual keys.
  if (!closed.hidden) return;
  if (runningIntro) {
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    event.preventDefault();
    runningIntro.skip();
    return;
  }
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

// Touch: swipe sideways between sections; vertical drags stay native scrolling.
/** @type {{ x: number, y: number } | undefined} */
let touchStart;
viewport.addEventListener(
  'touchstart',
  (event) => {
    const touch = event.touches[0];
    touchStart = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : undefined;
  },
  { passive: true },
);
viewport.addEventListener(
  'touchend',
  (event) => {
    const touch = event.changedTouches[0];
    if (!touchStart || !touch) return;
    const delta = swipeDelta(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
    touchStart = undefined;
    if (delta !== 0) showSection(activeIndex + delta);
  },
  { passive: true },
);

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

/** Hands the screen to the TUI: after the intro, and after a reconnect. */
function enterTui() {
  runningIntro = undefined;
  if (!isCoarsePointer) screen.focus({ preventScroll: true });
}

intro.addEventListener('pointerdown', () => runningIntro?.skip());

// Quit and reconnect: what ssh prints when the session ends, then a way back.

const COPIED_MS = 2000;

function endSession() {
  if (!closed.hidden) return;
  runningIntro?.skip();
  screen.dataset.state = 'closed';
  closed.hidden = false;
  live.textContent = `${goodbye.textContent ?? ''} Connection to ${sshHost} closed.`;
  reconnectButton.focus();
}

function reconnect() {
  closed.hidden = true;
  delete screen.dataset.state;
  live.textContent = '';
  runningIntro = playIntro({
    overlay: intro,
    command: `ssh ${sshHost}`,
    onDone: () => {
      enterTui();
      showSection(activeIndex);
    },
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    typing: false,
  });
}

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(`ssh ${sshHost}`);
    copyButton.textContent = 'Copied';
    window.setTimeout(() => (copyButton.textContent = 'Copy'), COPIED_MS);
  } catch {
    // No clipboard access (insecure origin, denied): select it so Ctrl/Cmd+C works.
    getSelection()?.selectAllChildren(sshCommand);
  }
}

closeButton.addEventListener('click', endSession);
reconnectButton.addEventListener('click', reconnect);
copyButton.addEventListener('click', () => void copyCommand());

hints.textContent = isCoarsePointer ? TOUCH_HINTS : KEY_HINTS;
const linkedIndex = panels.findIndex((panel) => `#${panel.id}` === location.hash);
showSection(linkedIndex >= 0 ? linkedIndex : 0);
live.textContent = '';
void document.fonts.ready.then(renderForWidth);
runningIntro = playIntro({
  overlay: intro,
  command: `ssh ${sshHost}`,
  onDone: enterTui,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
});
