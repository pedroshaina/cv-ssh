import type { CvContent } from '../content/content.types.js';
import { PADDING_X } from '../ui/layout.constants.js';
import { renderBanner } from '../ui/rendering/render-banner.js';
import { renderMarkdown } from '../ui/rendering/render-markdown.js';
import { textWidthFor } from '../ui/rendering/text-width.js';
import { ansiToHtml } from './ansi-to-html.js';
import type { CvView } from './cv-view.types.js';

/** The CV as the TUI would render it in a terminal `cols` wide; `cols` is already validated. */
export function renderCvView(content: CvContent, cols: number): CvView {
  const textWidth = textWidthFor(cols);
  const { header } = content;
  return {
    cols,
    name: header?.name ?? '',
    bannerArt: header ? (renderBanner(header.name, cols - 2 * PADDING_X) ?? null) : null,
    taglineHtml: header ? ansiToHtml(renderMarkdown(header.tagline, textWidth)) : '',
    sections: content.sections.map((section) => ({
      id: section.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      title: section.title,
      html: ansiToHtml(renderMarkdown(section.markdown, textWidth)),
    })),
  };
}
