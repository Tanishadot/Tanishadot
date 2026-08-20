#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchContributions } from './fetch-contributions.js';
import { renderSvg } from './render-svg.js';

function parseArgs(argv) {
  const args = { outDir: 'dist' };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[i + 1];
    switch (flag) {
      case '--user':
      case '--username':
        args.username = value;
        if (!inline) i++;
        break;
      case '--out':
      case '--outDir':
        args.outDir = value;
        if (!inline) i++;
        break;
      default:
        if (!args.username && !flag.startsWith('-')) args.username = flag;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const username = args.username || process.env.INPUT_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!username) {
  console.error('Usage: node src/index.js --user <github-username> [--out dist]');
  process.exit(1);
}

console.log(`Fetching contributions for @${username}...`);
const data = await fetchContributions(username, token);
const active = data.cells.filter((c) => c.level > 0).length;
console.log(`  ${data.cells.length} days, ${active} active, ${data.total} contributions`);

const outDir = path.resolve(args.outDir);
await mkdir(outDir, { recursive: true });

const outputs = [
  ['space-shooter.svg', { theme: 'dark', auto: true }],
  ['space-shooter-dark.svg', { theme: 'dark' }],
  ['space-shooter-light.svg', { theme: 'light' }],
];

for (const [name, opts] of outputs) {
  const svg = renderSvg(data, { username, ...opts });
  const file = path.join(outDir, name);
  await writeFile(file, svg, 'utf8');
  console.log(`  wrote ${file} (${(svg.length / 1024).toFixed(1)} KB)`);
}
