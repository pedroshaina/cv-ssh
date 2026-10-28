export interface Section {
  title: string;
  markdown: string;
}

export interface Header {
  name: string;
  tagline: string;
}

export interface CvContent {
  header?: Header;
  sections: Section[];
}
