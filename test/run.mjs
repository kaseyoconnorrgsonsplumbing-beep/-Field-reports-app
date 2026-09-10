// Drives the harness in headless Chromium: draws an arrow with a label, adds a
// text box, crops, saves, then builds the PDF. Writes screenshots + PDF to test/out.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = 'test/out';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 430, height: 860 }, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.goto('http://localhost:5173/test/harness.html');
await page.waitForSelector('canvas');
await page.waitForTimeout(400);

const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

// Arrow tool: drag from label spot to the trap
await page.click('.editor-tools button:has-text("Arrow")');
let a = at(0.2, 0.25), b = at(0.42, 0.55);
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
await page.waitForSelector('.text-prompt input');
await page.fill('.text-prompt input', 'Leaking P-trap');
await page.click('.text-prompt button:has-text("OK")');
await page.screenshot({ path: `${OUT}/1-arrow.png` });

// Text tool
await page.click('.editor-tools button:has-text("Text")');
let t = at(0.55, 0.8);
await page.mouse.click(t.x, t.y);
await page.waitForSelector('.text-prompt input');
await page.fill('.text-prompt input', 'Cabinet floor swollen');
await page.click('.text-prompt button:has-text("OK")');

// Crop
await page.click('.editor-tools button:has-text("Crop")');
let c1 = at(0.1, 0.15), c2 = at(0.9, 0.9);
await page.mouse.move(c1.x, c1.y); await page.mouse.down(); await page.mouse.move(c2.x, c2.y, { steps: 6 }); await page.mouse.up();
await page.click('.editor-tools button:has-text("Apply")');
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/2-cropped.png` });

// Save
await page.click('button.save');
await page.waitForSelector('#saved');
const annotated = await page.$eval('#saved', (el) => el.src);
fs.writeFileSync(`${OUT}/annotated.jpg`, Buffer.from(annotated.split(',')[1], 'base64'));

// PDF
const pdfUri = await page.evaluate(() => window.__buildPdf());
fs.writeFileSync(`${OUT}/report.pdf`, Buffer.from(pdfUri.split(',')[1], 'base64'));
console.log('done');
await browser.close();
