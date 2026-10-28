import { Box, Text } from 'ink';
import { MIN_COLUMNS, MIN_ROWS } from '../layout.constants.js';

interface TooSmallNoticeProps {
  columns: number;
  rows: number;
}

export function TooSmallNotice({ columns, rows }: TooSmallNoticeProps) {
  return (
    <Box width={columns} height={rows} alignItems="center" justifyContent="center" flexDirection="column">
      <Text color="yellow">
        Too small: {columns}×{rows}
      </Text>
      <Text dimColor>
        Need {MIN_COLUMNS}×{MIN_ROWS} or more
      </Text>
      <Text dimColor>q to quit</Text>
    </Box>
  );
}
