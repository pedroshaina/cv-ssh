import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Asset {
  filePath: string;
  contentType: string;
}

// Two levels up from src/web/ in development and from dist/web/ in the image.
const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
};

/** Only plain file names directly in public/: no subfolders, no dots, so no way out of it. */
export function resolveAsset(pathname: string): Asset | undefined {
  const match = /^\/assets\/([a-z0-9-]+)\.(js|css)$/.exec(pathname);
  if (!match?.[1] || !match[2]) return undefined;
  const contentType = CONTENT_TYPES[match[2]];
  if (!contentType) return undefined;
  return { filePath: join(PUBLIC_DIR, `${match[1]}.${match[2]}`), contentType };
}
