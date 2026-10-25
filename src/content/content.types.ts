export interface Section {
  title: string;
  markdown: string;
}

export interface Header {
  name: string;
  /** Markdown shown under the name. */
  tagline: string;
}

export interface CvContent {
  header?: Header;
  sections: Section[];
}
