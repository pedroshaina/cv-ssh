import { useInput } from 'ink';
import type { Scroll } from './useScroll.js';

export interface KeyboardNavigationOptions {
  sectionCount: number;
  activeSectionIndex: number;
  /** Any index; wraps around past either end. */
  switchSection: (sectionIndex: number) => void;
  scroll: Scroll;
  quit: () => void;
}

/** The key map: arrows, vim keys, Tab, 1-9, paging, g/G and q. */
export function useKeyboardNavigation(options: KeyboardNavigationOptions): void {
  const { sectionCount, activeSectionIndex, switchSection, scroll, quit } = options;

  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) quit();
    else if (key.rightArrow || input === 'l' || (key.tab && !key.shift)) switchSection(activeSectionIndex + 1);
    else if (key.leftArrow || input === 'h' || (key.tab && key.shift)) switchSection(activeSectionIndex - 1);
    else if (/^[1-9]$/.test(input) && Number(input) <= sectionCount) switchSection(Number(input) - 1);
    else if (key.downArrow || input === 'j') scroll.scrollBy(1);
    else if (key.upArrow || input === 'k') scroll.scrollBy(-1);
    else if (key.pageDown || input === ' ') scroll.scrollBy(scroll.pageSize);
    else if (key.pageUp || input === 'b') scroll.scrollBy(-scroll.pageSize);
    else if (input === 'g') scroll.scrollToTop();
    else if (input === 'G') scroll.scrollToBottom();
  });
}
