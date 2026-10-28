// oxlint can't check where a file lives: keep JSX inside src/ui.
import { readdirSync } from 'node:fs';
import { sep } from 'node:path';

const misplacedFiles = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.startsWith(`ui${sep}`))
  .map((path) => `src/${path}`);

if (misplacedFiles.length > 0) {
  console.error(`.tsx files belong under src/ui/:\n${misplacedFiles.join('\n')}`);
  process.exit(1);
}
