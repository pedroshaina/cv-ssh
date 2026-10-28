import figlet from 'figlet';

// Biggest first.
const BANNER_FONTS = ['ANSI Shadow', 'Standard', 'Small'] as const;

export function renderBanner(name: string, maxWidth: number): string | undefined {
  for (const font of BANNER_FONTS) {
    const bannerArt = figlet.textSync(name, { font }).replace(/\s+$/, '');
    const bannerWidth = Math.max(...bannerArt.split('\n').map((line) => line.length));
    if (bannerWidth <= maxWidth) return bannerArt;
  }
  return undefined;
}
