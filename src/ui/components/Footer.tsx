import { Box, Text } from 'ink';

interface FooterProps {
  scrollPercent?: number;
}

export function Footer({ scrollPercent }: FooterProps) {
  return (
    <Box paddingX={1} justifyContent="space-between" flexShrink={0}>
      <Text dimColor>←/→ sections · ↑/↓ scroll · space/b page · q quit</Text>
      {scrollPercent !== undefined && <Text dimColor>{scrollPercent}%</Text>}
    </Box>
  );
}
