#!/usr/bin/env node
/** Writes dist/preview.html so both themes can be watched side by side locally. */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve('dist');
const html = `<!doctype html>
<meta charset="utf-8">
<title>space shooter preview</title>
<style>
  body{margin:0;padding:32px;background:#0d1117;color:#c9d1d9;
       font:14px 'Segoe UI',system-ui,sans-serif;display:grid;gap:28px;justify-items:center}
  section{width:100%;max-width:840px}
  h2{font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#7d8590}
  .light{background:#fff;padding:16px;border-radius:8px}
  img{width:100%;display:block}
</style>
<section><h2>dark</h2><img src="space-shooter-dark.svg"></section>
<section><h2>light</h2><div class="light"><img src="space-shooter-light.svg"></div></section>
<section><h2>auto (follows your OS theme)</h2><img src="space-shooter.svg"></section>
`;
await writeFile(path.join(dir, 'preview.html'), html, 'utf8');
console.log(`  wrote ${path.join(dir, 'preview.html')}`);
