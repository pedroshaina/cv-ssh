import { useRef, useState, type RefObject } from 'react';
import { useBoxMetrics, type DOMElement } from 'ink';

export interface Scroll {
  /** Attach to the box that clips the content. */
  viewportRef: RefObject<DOMElement | null>;
  /** Attach to the full-height content inside the viewport. */
  contentRef: RefObject<DOMElement | null>;
  scrollTop: number;
  maxScrollTop: number;
  /** Lines one page key moves, keeping a little overlap for context. */
  pageSize: number;
  scrollBy: (lineCount: number) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

/** Vertical scrolling of content taller than its viewport. */
export function useScroll(): Scroll {
  const [requestedScrollTop, setRequestedScrollTop] = useState(0);
  const viewportRef = useRef<DOMElement>(null);
  const contentRef = useRef<DOMElement>(null);
  const viewport = useBoxMetrics(viewportRef);
  const contentBox = useBoxMetrics(contentRef);

  // Clamp on every render: the bound moves when switching tabs or resizing.
  const maxScrollTop = Math.max(0, contentBox.height - viewport.clientHeight);
  const scrollTop = Math.min(requestedScrollTop, maxScrollTop);

  return {
    viewportRef,
    contentRef,
    scrollTop,
    maxScrollTop,
    pageSize: Math.max(1, viewport.clientHeight - 2),
    scrollBy: (lineCount) => setRequestedScrollTop(Math.max(0, Math.min(maxScrollTop, scrollTop + lineCount))),
    scrollToTop: () => setRequestedScrollTop(0),
    scrollToBottom: () => setRequestedScrollTop(maxScrollTop),
  };
}
