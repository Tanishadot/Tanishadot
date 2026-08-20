#!/usr/bin/env node
/**
 * Dev helper: renders the animation at a fixed point in time so a frame can be
 * eyeballed (or screenshotted) without watching the whole loop. Every animated
 * element shares one duration, so a single negative animation-delay scrubs the
 * entire timeline to that moment.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const at = process.argv[2] ? Number(process.argv[2]) : 8;
const svg = await readFile(path.resolve('dist/space-shooter-dark.svg'), 'utf8');
const scrubbed = svg
  .replace(']]></style>', `.c,.b,.ship{animation-delay:-${at}s !important}]]></style>`)
  .replace('<svg ', '<svg style="display:block" ');

const out = path.resolve(`dist/frame-${at}s.html`);
await writeFile(
  out,
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#0d1117}</style>\n${scrubbed}\n`,
  'utf8'
);
console.log(out);
