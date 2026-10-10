// Inlines the built JS and CSS into one self-contained HTML file (dist/fuse-2048.html),
// handy for sharing a playable copy without hosting the assets folder.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g, (_, href) => {
  return `<style>${readFileSync(join(dist, href), 'utf8')}</style>`;
});

if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('Some assets were not inlined');
writeFileSync(join(dist, 'fuse-2048.html'), html);
console.log(`Wrote ${join(dist, 'fuse-2048.html')} (${(html.length / 1024).toFixed(1)} KB)`);
