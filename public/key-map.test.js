import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionForKey } from './key-map.js';

/** @param {string} key @param {Partial<import('./key-map.js').KeyInput>} [modifiers] */
function press(key, modifiers = {}) {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers };
}

const context = { sectionCount: 4, hasSelection: false, focusOnControl: false };

test('arrows, h/l and Tab change section like the TUI', () => {
  for (const key of ['ArrowRight', 'l', 'Tab'])
    assert.deepEqual(actionForKey(press(key), context), { type: 'section', delta: 1 });
  for (const key of ['ArrowLeft', 'h'])
    assert.deepEqual(actionForKey(press(key), context), { type: 'section', delta: -1 });
  assert.deepEqual(actionForKey(press('Tab', { shiftKey: true }), context), { type: 'section', delta: -1 });
});

test('digits jump to an existing section only', () => {
  assert.deepEqual(actionForKey(press('3'), context), { type: 'jump', index: 2 });
  assert.equal(actionForKey(press('5'), context), null);
  assert.equal(actionForKey(press('0'), context), null);
});

test('up/down, j/k scroll a line; space/b and page keys scroll a page', () => {
  for (const key of ['ArrowDown', 'j'])
    assert.deepEqual(actionForKey(press(key), context), { type: 'scroll', lines: 1 });
  for (const key of ['ArrowUp', 'k'])
    assert.deepEqual(actionForKey(press(key), context), { type: 'scroll', lines: -1 });
  for (const key of [' ', 'PageDown'])
    assert.deepEqual(actionForKey(press(key), context), { type: 'page', direction: 1 });
  for (const key of ['b', 'PageUp'])
    assert.deepEqual(actionForKey(press(key), context), { type: 'page', direction: -1 });
});

test('g and G go to the top and bottom', () => {
  assert.deepEqual(actionForKey(press('g'), context), { type: 'top' });
  assert.deepEqual(actionForKey(press('G', { shiftKey: true }), context), { type: 'bottom' });
});

test('q, Escape and Ctrl+C quit', () => {
  for (const key of ['q', 'Escape']) assert.deepEqual(actionForKey(press(key), context), { type: 'quit' });
  assert.deepEqual(actionForKey(press('c', { ctrlKey: true }), context), { type: 'quit' });
});

test('Ctrl+C with text selected is a copy, not a quit', () => {
  assert.equal(actionForKey(press('c', { ctrlKey: true }), { ...context, hasSelection: true }), null);
});

test('browser shortcuts with Cmd, Alt or Ctrl pass through', () => {
  assert.equal(actionForKey(press('c', { metaKey: true }), context), null);
  assert.equal(actionForKey(press('l', { metaKey: true }), context), null);
  assert.equal(actionForKey(press('ArrowLeft', { altKey: true }), context), null);
  assert.equal(actionForKey(press('l', { ctrlKey: true }), context), null);
});

test('Tab moves focus normally while a button or link has it; other keys still work', () => {
  const onControl = { ...context, focusOnControl: true };
  assert.equal(actionForKey(press('Tab'), onControl), null);
  assert.deepEqual(actionForKey(press('q'), onControl), { type: 'quit' });
});
