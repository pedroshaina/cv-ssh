import { Box, Text } from 'ink';
import type { Section } from '../../content/content.types.js';

interface TabBarProps {
  sections: Section[];
  activeSectionIndex: number;
}

export function TabBar({ sections, activeSectionIndex }: TabBarProps) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} columnGap={1} flexWrap="wrap" flexShrink={0}>
      {sections.map((section, sectionIndex) => {
        const isActive = sectionIndex === activeSectionIndex;
        return (
          <Text key={section.title} bold={isActive} inverse={isActive} dimColor={!isActive}>
            {` ${section.title} `}
          </Text>
        );
      })}
    </Box>
  );
}
