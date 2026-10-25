import { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Header } from '../../content/content.types.js';
import { renderBanner } from '../rendering/render-banner.js';
import { renderMarkdown } from '../rendering/render-markdown.js';
import { CHROME_ROWS, MIN_CONTENT_ROWS, PADDING_X } from '../layout.constants.js';

interface BannerProps {
  header: Header;
  columns: number;
  rows: number;
  textWidth: number;
}

/** The name as ASCII art when there's room for it, plain bold text otherwise, then the tagline. */
export function Banner({ header, columns, rows, textWidth }: BannerProps) {
  const tagline = useMemo(() => renderMarkdown(header.tagline, textWidth), [header.tagline, textWidth]);
  const taglineRows = tagline ? tagline.split('\n').length : 0;

  const bannerArt = useMemo(() => {
    const candidateArt = renderBanner(header.name, columns - 2 * PADDING_X);
    if (!candidateArt) return undefined;
    const bannerRows = candidateArt.split('\n').length + taglineRows + 1;
    return rows - bannerRows - CHROME_ROWS >= MIN_CONTENT_ROWS ? candidateArt : undefined;
  }, [header.name, columns, rows, taglineRows]);

  return (
    <Box flexDirection="column" paddingX={PADDING_X} paddingTop={1} flexShrink={0}>
      {bannerArt ? (
        <Text color="cyan">{bannerArt}</Text>
      ) : (
        <Text color="cyan" bold>
          {header.name}
        </Text>
      )}
      {tagline && <Text>{tagline}</Text>}
    </Box>
  );
}
