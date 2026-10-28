import { useRef, useState, type RefObject } from 'react';
import { useBoxMetrics, type DOMElement } from 'ink';

export interface Scroll {
  viewportRef: RefObject<DOMElement | null>;
  contentRef: RefObject<DOMElement | null>;
  scrollTop: number;
  maxScrollTop: number;
  pageSize: number;
  scrollBy: (lineCount: number) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

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
