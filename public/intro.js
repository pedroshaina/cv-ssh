const MIN_KEY_MS = 55;
const MAX_KEY_MS = 110;
const ENTER_PAUSE_MS = 250;
const CONNECTING_MS = 600;

/**
 * Types the ssh command, "connects", then hands over to the TUI. skip() hands over at once.
 * With typing off (a reconnect), the command shows at once and only the connect plays.
 * @param {{ overlay: HTMLElement, command: string, onDone: () => void, reducedMotion: boolean, typing?: boolean }} options
 * @returns {{ skip(): void }}
 */
export function playIntro({ overlay, command, onDone, reducedMotion, typing = true }) {
  const typed = /** @type {HTMLElement} */ (overlay.querySelector('.typed'));
  const status = /** @type {HTMLElement} */ (overlay.querySelector('.intro-status'));
  let timer = 0;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    overlay.hidden = true;
    onDone();
  };

  /** @param {() => void} step @param {number} delayMs */
  const after = (step, delayMs) => {
    timer = window.setTimeout(step, delayMs);
  };

  overlay.hidden = false;
  typed.textContent = '';
  status.textContent = '';

  if (reducedMotion) {
    requestAnimationFrame(finish);
    return { skip: finish };
  }

  const host = command.replace(/^ssh\s+/, '');
  /** @param {number} length */
  const typeFrom = (length) => {
    typed.textContent = command.slice(0, length);
    if (length < command.length) {
      after(() => typeFrom(length + 1), MIN_KEY_MS + Math.random() * (MAX_KEY_MS - MIN_KEY_MS));
      return;
    }
    after(() => {
      status.textContent = `Connecting to ${host}…`;
      after(finish, CONNECTING_MS);
    }, ENTER_PAUSE_MS);
  };
  if (typing) after(() => typeFrom(1), 400);
  else typeFrom(command.length);

  return { skip: finish };
}
