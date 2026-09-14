import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:5174';
let failures = 0;
const out = [];
const check = (l, c, d = '') => { if (c) out.push('  PASS  ' + l); else { failures += 1; out.push('  FAIL  ' + l + (d ? '  -> ' + d : '')); } };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/tmp/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/403|favicon|fonts\.|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });

// a native dialog would mean the placeholder is still there
let dialogText = null;
page.on('dialog', async (d) => { dialogText = d.message(); await d.dismiss(); });

await page.goto(BASE + '/restaurant/r_ramen_house', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 900));

// capture window.open instead of actually navigating away
await page.evaluate(() => { window.__opened = null; window.open = (url, target, features) => { window.__opened = { url, target, features }; return null; }; });

const text = await page.evaluate(() => document.body.innerText);
check('Detail screen rendered', /Ramen House/i.test(text), text.slice(0, 80));

const btn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Directions') || null);
check('Directions button is present', Boolean(btn.asElement()));
await btn.asElement().click();
await new Promise((r) => setTimeout(r, 600));

const opened = await page.evaluate(() => window.__opened);
check('No placeholder dialog appeared', dialogText === null, String(dialogText));
check('A maps destination was opened', Boolean(opened?.url), JSON.stringify(opened));
check('URL is a keyless Google Maps URL', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1/.test(opened.url), opened.url);
check('Destination is the selected restaurant', decodeURIComponent(opened.url).includes('Ramen House'), opened.url);
check('No API key in the URL', !/key=|AIza|apiKey|GEOAPIFY/i.test(opened.url), opened.url);
check('Not a metered Google endpoint', !opened.url.includes('maps.googleapis.com'), opened.url);
check('Opens in a new tab with noopener', opened.target === '_blank' && /noopener/.test(opened.features || ''), JSON.stringify(opened));
check('Old placeholder text is nowhere on the screen', !/connected to one/i.test(text));
check('No console errors', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log(out.join('\n'));
console.log(failures === 0 ? '\nALL DIRECTIONS CHECKS PASSED' : '\n' + failures + ' DIRECTIONS CHECK(S) FAILED');
await browser.close();
process.exit(failures ? 1 : 0);
