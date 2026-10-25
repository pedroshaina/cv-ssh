/** `01-about.md` -> "About", `03-side-projects.md` -> "Side projects". */
export function titleFromFilename(filename: string): string {
  const words = filename
    .replace(/\.md$/, '')
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
