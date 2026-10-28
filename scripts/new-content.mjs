import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const [kind, id] = process.argv.slice(2);
if (!['show', 'theme'].includes(kind) || !/^[a-z][a-z0-9-]*$/.test(id ?? '')) {
  console.error('Usage: npm run new:show -- my-show   or   npm run new:theme -- my-theme');
  process.exit(1);
}
const root = new URL('../', import.meta.url);
const example = kind === 'show' ? 'longitude-waves' : 'blue-hour';
let content = await readFile(new URL(`examples/${example}.js`, root), 'utf8');
content = content.replaceAll(example, id).replace('../src/shows/math.js', './math.js');
content = content.replace(/^\/\/ Copy[^\n]*\n/, '');
content = content.replace(
  '// This example is tested, but deliberately absent from the default shuffle.\n',
  '',
);
const destination = new URL(`src/${kind}s/${id}.js`, root);
await writeFile(destination, content, { flag: 'wx' });
console.log(
  `Created ${fileURLToPath(destination)}. Add its import and entry to src/${kind}s/index.js, then npm run check.`,
);
