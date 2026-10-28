// JSX is the UI's business: a .tsx file anywhere else means UI code has leaked
// out of src/ui. oxlint has no rule for where a file lives, hence this check.
import { readdirSync } from 'node:fs';
import { sep } from 'node:path';

const misplacedFiles = readdirSync('src', { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx') && !path.startsWith(`ui${sep}`))
  .map((path) => `src/${path}`);

if (misplacedFiles.length > 0) {
  console.error(`.tsx files belong under src/ui/:\n${misplacedFiles.join('\n')}`);
  process.exit(1);
}
