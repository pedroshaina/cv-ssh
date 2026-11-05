/**
 * @typedef {{ type: 'section', delta: 1 | -1 } | { type: 'jump', index: number } | { type: 'scroll', lines: number }
 *   | { type: 'page', direction: 1 | -1 } | { type: 'top' } | { type: 'bottom' } | { type: 'quit' }} Action
 * @typedef {{ key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, shiftKey: boolean }} KeyInput
 * @typedef {{ sectionCount: number, hasSelection: boolean, focusOnControl: boolean }} KeyContext
 */

/**
 * The TUI's keys (src/ui/hooks/useKeyboardNavigation.ts), minus what the browser needs:
 * copying with Ctrl+C, Cmd/Alt shortcuts, and Tab between real buttons.
 * @param {KeyInput} input
 * @param {KeyContext} context
 * @returns {Action | null}
 */
export function actionForKey(input, context) {
  const { key } = input;
  if (input.metaKey || input.altKey) return null;
  if (input.ctrlKey) return key === 'c' && !context.hasSelection ? { type: 'quit' } : null;

  if (key === 'q' || key === 'Escape') return { type: 'quit' };
  if (key === 'Tab') {
    if (context.focusOnControl) return null;
    return { type: 'section', delta: input.shiftKey ? -1 : 1 };
  }
  if (key === 'ArrowRight' || key === 'l') return { type: 'section', delta: 1 };
  if (key === 'ArrowLeft' || key === 'h') return { type: 'section', delta: -1 };
  if (/^[1-9]$/.test(key)) {
    const index = Number(key) - 1;
    return index < context.sectionCount ? { type: 'jump', index } : null;
  }
  if (key === 'ArrowDown' || key === 'j') return { type: 'scroll', lines: 1 };
  if (key === 'ArrowUp' || key === 'k') return { type: 'scroll', lines: -1 };
  if (key === ' ' || key === 'PageDown') return { type: 'page', direction: 1 };
  if (key === 'b' || key === 'PageUp') return { type: 'page', direction: -1 };
  if (key === 'g') return { type: 'top' };
  if (key === 'G') return { type: 'bottom' };
  return null;
}
