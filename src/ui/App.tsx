import { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useWindowSize } from 'ink';
import type { CvContent } from '../content/content.types.js';
import { renderMarkdown } from './rendering/render-markdown.js';
import { Banner } from './components/Banner.js';
import { Footer } from './components/Footer.js';
import { TabBar } from './components/TabBar.js';
import { TooSmallNotice } from './components/TooSmallNotice.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';
import { useScroll } from './hooks/useScroll.js';
import { MAX_TEXT_WIDTH, MIN_COLUMNS, MIN_ROWS, MIN_TEXT_WIDTH, PADDING_X } from './layout.constants.js';

export interface AppProps {
  content: CvContent;
  onSectionView?: (title: string) => void;
}

export function App({ content, onSectionView }: AppProps) {
  const { sections, header } = content;
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const scroll = useScroll();

  const textWidth = Math.max(MIN_TEXT_WIDTH, Math.min(columns - 2 * PADDING_X, MAX_TEXT_WIDTH));
  const activeSection = sections[activeSectionIndex];
  const renderedSection = useMemo(
    () => (activeSection ? renderMarkdown(activeSection.markdown, textWidth) : ''),
    [activeSection, textWidth],
  );

  useEffect(() => {
    if (activeSection) onSectionView?.(activeSection.title);
  }, [activeSection, onSectionView]);

  const switchSection = (sectionIndex: number) => {
    const sectionCount = sections.length;
    if (sectionCount === 0) return;
    setActiveSectionIndex(((sectionIndex % sectionCount) + sectionCount) % sectionCount);
    scroll.scrollToTop();
  };

  useKeyboardNavigation({ sectionCount: sections.length, activeSectionIndex, switchSection, scroll, quit: exit });

  if (columns < MIN_COLUMNS || rows < MIN_ROWS) {
    return <TooSmallNotice columns={columns} rows={rows} />;
  }

  if (!activeSection) {
    return <Text color="red">No content found. Add Markdown files to the content directory.</Text>;
  }

  const { viewportRef, contentRef, maxScrollTop, scrollTop } = scroll;
  const scrollPercent = maxScrollTop === 0 ? 100 : Math.round((scrollTop / maxScrollTop) * 100);

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {header && <Banner header={header} columns={columns} rows={rows} textWidth={textWidth} />}

      <TabBar sections={sections} activeSectionIndex={activeSectionIndex} />

      <Box ref={viewportRef} flexGrow={1} overflow="hidden" contentOffsetY={scrollTop} flexDirection="column">
        <Box ref={contentRef} flexDirection="column" flexShrink={0} paddingX={PADDING_X} paddingY={1}>
          <Text>{renderedSection}</Text>
        </Box>
      </Box>

      <Footer scrollPercent={maxScrollTop > 0 ? scrollPercent : undefined} />
    </Box>
  );
}
