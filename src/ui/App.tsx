import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useBoxMetrics, useInput, useWindowSize, type DOMElement } from 'ink';
import type { CvContent, Header } from '../content/content.types.js';
import { renderBanner } from '../rendering/render-banner.js';
import { renderMarkdown } from '../rendering/render-markdown.js';

/** Comfortable reading width; wider terminals get margin, not longer lines. */
const MAX_TEXT_WIDTH = 80;
const MIN_COLUMNS = 40;
const MIN_ROWS = 12;
/** Content rows to keep free before giving up the ASCII-art banner. */
const MIN_CONTENT_ROWS = 12;
/** Rows taken by the tab bar (with its border) and the footer. */
const CHROME_ROWS = 4;

interface AppProps {
  content: CvContent;
  onSectionView?: (title: string) => void;
}

export function App({ content, onSectionView }: AppProps) {
  const { sections, header } = content;
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [activeTab, setActiveTab] = useState(0);
  const [requestedScrollTop, setRequestedScrollTop] = useState(0);

  const viewportRef = useRef<DOMElement>(null);
  const contentRef = useRef<DOMElement>(null);
  const viewport = useBoxMetrics(viewportRef);
  const contentBox = useBoxMetrics(contentRef);

  // Clamp on every render: the bound moves when switching tabs or resizing.
  const maxScrollTop = Math.max(0, contentBox.height - viewport.clientHeight);
  const scrollTop = Math.min(requestedScrollTop, maxScrollTop);

  const textWidth = Math.max(20, Math.min(columns - 4, MAX_TEXT_WIDTH));
  const section = sections[activeTab];
  const rendered = useMemo(
    () => (section ? renderMarkdown(section.markdown, textWidth) : ''),
    [section, textWidth],
  );

  useEffect(() => {
    if (section) onSectionView?.(section.title);
  }, [section, onSectionView]);

  const switchTab = (index: number) => {
    const count = sections.length;
    if (count === 0) return;
    setActiveTab(((index % count) + count) % count);
    setRequestedScrollTop(0);
  };
  const scrollBy = (delta: number) => setRequestedScrollTop(Math.max(0, Math.min(maxScrollTop, scrollTop + delta)));
  const page = Math.max(1, viewport.clientHeight - 2);

  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit();
    else if (key.rightArrow || input === 'l' || (key.tab && !key.shift)) switchTab(activeTab + 1);
    else if (key.leftArrow || input === 'h' || (key.tab && key.shift)) switchTab(activeTab - 1);
    else if (/^[1-9]$/.test(input) && Number(input) <= sections.length) switchTab(Number(input) - 1);
    else if (key.downArrow || input === 'j') scrollBy(1);
    else if (key.upArrow || input === 'k') scrollBy(-1);
    else if (key.pageDown || input === ' ') scrollBy(page);
    else if (key.pageUp || input === 'b') scrollBy(-page);
    else if (input === 'g') setRequestedScrollTop(0);
    else if (input === 'G') setRequestedScrollTop(maxScrollTop);
  });

  if (columns < MIN_COLUMNS || rows < MIN_ROWS) {
    return (
      <Box width={columns} height={rows} alignItems="center" justifyContent="center" flexDirection="column">
        <Text color="yellow">Too small: {columns}×{rows}</Text>
        <Text dimColor>
          Need {MIN_COLUMNS}×{MIN_ROWS} or more
        </Text>
        <Text dimColor>q to quit</Text>
      </Box>
    );
  }

  if (!section) {
    return <Text color="red">No content found. Add Markdown files to the content directory.</Text>;
  }

  const scrollPercent = maxScrollTop === 0 ? 100 : Math.round((scrollTop / maxScrollTop) * 100);

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {header && <Banner header={header} columns={columns} rows={rows} textWidth={textWidth} />}

      <Box borderStyle="round" borderColor="gray" paddingX={1} columnGap={1} flexWrap="wrap" flexShrink={0}>
        {sections.map((s, i) => (
          <Text key={s.title} bold={i === activeTab} inverse={i === activeTab} dimColor={i !== activeTab}>
            {` ${s.title} `}
          </Text>
        ))}
      </Box>

      <Box ref={viewportRef} flexGrow={1} overflow="hidden" contentOffsetY={scrollTop} flexDirection="column">
        <Box ref={contentRef} flexDirection="column" flexShrink={0} paddingX={2} paddingY={1}>
          <Text>{rendered}</Text>
        </Box>
      </Box>

      <Box paddingX={1} justifyContent="space-between" flexShrink={0}>
        <Text dimColor>←/→ sections · ↑/↓ scroll · space/b page · q quit</Text>
        {maxScrollTop > 0 && <Text dimColor>{scrollPercent}%</Text>}
      </Box>
    </Box>
  );
}

interface BannerProps {
  header: Header;
  columns: number;
  rows: number;
  textWidth: number;
}

function Banner({ header, columns, rows, textWidth }: BannerProps) {
  const tagline = useMemo(() => renderMarkdown(header.tagline, textWidth), [header.tagline, textWidth]);
  const taglineRows = tagline ? tagline.split('\n').length : 0;

  const art = useMemo(() => {
    const candidate = renderBanner(header.name, columns - 4);
    if (!candidate) return undefined;
    const bannerRows = candidate.split('\n').length + taglineRows + 1;
    return rows - bannerRows - CHROME_ROWS >= MIN_CONTENT_ROWS ? candidate : undefined;
  }, [header.name, columns, rows, taglineRows]);

  return (
    <Box flexDirection="column" paddingX={2} paddingTop={1} flexShrink={0}>
      {art ? (
        <Text color="cyan">{art}</Text>
      ) : (
        <Text color="cyan" bold>
          {header.name}
        </Text>
      )}
      {tagline && <Text>{tagline}</Text>}
    </Box>
  );
}
