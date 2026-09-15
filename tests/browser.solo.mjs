import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:5174';
let failures = 0; const out = [];
const check = (l,c,d='') => { if(c) out.push('  PASS  '+l); else { failures++; out.push('  FAIL  '+l+(d?'  -> '+d:'')); } };
const browser = await puppeteer.launch({executablePath: process.env.CHROME||'/tmp/chromium', headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage();
await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{ if(m.type()==='error' && !/403|404|favicon|fonts\.|Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });
const text = () => page.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
const path = () => page.evaluate(()=>location.pathname);

await page.goto(BASE+'/',{waitUntil:'networkidle0'});
await page.evaluate(()=>localStorage.clear());
await page.goto(BASE+'/',{waitUntil:'networkidle0'});
await new Promise(r=>setTimeout(r,1400));

// solo must be reachable without any group
check('Discover offers solo browsing', /browse on your own/i.test(await text()));
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>/browse on your own/i.test(b.innerText))?.click());
await new Promise(r=>setTimeout(r,1200));
check('Reaches solo browse', (await path())==='/browse', await path());
check('No group code required', !/code/i.test((await text()).slice(0,120)));

const cards = await page.evaluate(()=>[...document.querySelectorAll('article h2')].map(h=>h.textContent.trim()));
check('Solo deck renders', cards.length>0, JSON.stringify(cards));
check('Solo shows it is private', /nobody else sees these/i.test(await text()));

// restaurants -> dishes
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Dishes')?.click());
await new Promise(r=>setTimeout(r,800));
check('Dishes mode works solo', /₹\d+/.test(await text()), (await text()).slice(0,200));
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Restaurants')?.click());
await new Promise(r=>setTimeout(r,800));

// swipe through
for(let i=0;i<40;i++){
  const b = await page.$(i%2===0?'[aria-label="Like this"]':'[aria-label="Pass on this"]');
  if(!b) break; await b.click(); await new Promise(r=>setTimeout(r,200));
}
await new Promise(r=>setTimeout(r,900));
check('Solo finishes with a shortlist', /your shortlist/i.test(await text()), (await text()).slice(0,200));

// shortlist -> restaurant detail -> directions
await page.evaluate(()=>document.querySelector('ul li button')?.click());
await new Promise(r=>setTimeout(r,1200));
check('Shortlist opens a restaurant', (await path()).startsWith('/restaurant/'), await path());
await page.evaluate(()=>{window.__opened=null;window.open=(u)=>{window.__opened=u;return null;};});
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Directions')?.click());
await new Promise(r=>setTimeout(r,500));
const opened = await page.evaluate(()=>window.__opened);
check('Directions works in solo mode', /google\.com\/maps\/dir\/\?api=1/.test(opened||''), String(opened));
check('No console errors', errors.length===0, errors.slice(0,2).join(' | '));

console.log(out.join('\n'));
console.log(failures===0?'\nALL SOLO CHECKS PASSED':'\n'+failures+' CHECK(S) FAILED');
await browser.close();
process.exit(failures?1:0);
