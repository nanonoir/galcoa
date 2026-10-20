// Estudio local aislado: no lee entorno, no inicia Next ni reutiliza navegadores.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const base = path.dirname(fileURLToPath(import.meta.url));
await mkdir(path.join(base, 'assets'), { recursive: true });
await mkdir(path.join(base, 'evidence'), { recursive: true });
const sources = {};
for (const [key, family] of [['manrope', 'Manrope:wght@400..700'], ['space', 'Space+Grotesk:wght@400..700'], ['mono', 'IBM+Plex+Mono:wght@400']]) {
  const destination = path.join(base, 'assets', `${key}.woff2`);
  try { if ((await readFile(destination)).subarray(0, 4).toString() === 'wOF2') continue; } catch { /* Descarga pública solo si falta el archivo. */ }
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  const response = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Font CSS: ${response.status}`);
  const css = await response.text();
  const blocks = css.split('/* latin */');
  const url = blocks.at(-1).match(/url\((https:[^)]+)\)/)?.[1];
  if (!url?.endsWith('.woff2') || (key !== 'mono' && !blocks.at(-1).includes('font-weight: 400 700'))) throw new Error(`No variable Latin WOFF2: ${key}`);
  const font = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!font.ok) throw new Error(`Font asset: ${font.status}`);
  const bytes = Buffer.from(await font.arrayBuffer());
  if (bytes.subarray(0, 4).toString() !== 'wOF2') throw new Error(`Invalid WOFF2: ${key}`);
  await writeFile(destination, bytes);
  sources[key] = { cssUrl, assetUrl: url };
}
if (Object.keys(sources).length) await writeFile(path.join(base, 'assets', 'sources.json'), JSON.stringify(sources, null, 2));
for (const [key, directory] of [['manrope', 'manrope'], ['space', 'spacegrotesk'], ['mono', 'ibmplexmono']]) {
  const destination = path.join(base, 'assets', `${key}-OFL.txt`);
  try { await readFile(destination); continue; } catch { /* Licencia pública del archivo tipográfico. */ }
  const response = await fetch(`https://raw.githubusercontent.com/google/fonts/main/ofl/${directory}/OFL.txt`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Font license: ${response.status}`);
  await writeFile(destination, await response.text());
}
const browser = await chromium.launch({ headless: true });
const observations = [];
try {
  for (const screen of ['landing', 'chat', 'confirmation']) {
    for (const font of ['space', 'manrope']) {
      for (const width of [1440, 390, 320, 768]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
        const url = pathToFileURL(path.join(base, 'prototype.html'));
        url.search = new URLSearchParams({ screen, font }).toString();
        await page.goto(url.href);
        await page.evaluate(() => document.fonts.ready);
        const metrics = await page.evaluate(() => {
          const h = document.querySelector('h1');
          const p = document.querySelector('[data-reading]') || document.querySelector('.message p:last-child') || document.querySelector('.lead');
          const box = element => ({ height: element.getBoundingClientRect().height, lineHeight: getComputedStyle(element).lineHeight, font: getComputedStyle(element).fontFamily });
          return { overflow: document.documentElement.scrollWidth > innerWidth, title: box(h), reading: box(p), checkboxChecked: document.querySelector('[type=checkbox]')?.checked ?? null };
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('DOM.enable');
        await cdp.send('CSS.enable');
        const { root } = await cdp.send('DOM.getDocument');
        const actualFonts = {};
        for (const selector of ['h1', '.mono', '[data-reading]', '.message p:last-child', '.lead']) {
          const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
          if (nodeId) actualFonts[selector] = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
        }
        if ([1440, 390].includes(width)) await page.screenshot({ path: path.join(base, 'evidence', `${screen}-${font}-${width}.png`), fullPage: true });
        observations.push({ screen, font, width, ...metrics, actualFonts });
        await page.close();
      }
    }
  }
  await writeFile(path.join(base, 'evidence', 'metrics.json'), JSON.stringify(observations, null, 2));
  if (observations.some(item => item.overflow)) throw new Error('Desborde horizontal: ver metrics.json');
  console.log(`Render aislado: ${observations.length} vistas, 12 capturas; sin desborde horizontal.`);
} finally { await browser.close(); }
