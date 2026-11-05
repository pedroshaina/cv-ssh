export interface CvSectionView {
  id: string;
  title: string;
  /** Rendered by the TUI's Markdown pipeline, then converted to escaped, classed HTML. */
  html: string;
}

export interface CvView {
  cols: number;
  name: string;
  /** Plain text: escaped by whoever puts it in a page. */
  bannerArt: string | null;
  taglineHtml: string;
  sections: CvSectionView[];
}
