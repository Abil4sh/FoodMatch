/*
 * Directions link tests. Pure URL construction — nothing is opened and no
 * network request is made.
 */
import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';

const out = path.resolve('tests/.maps-bundle.mjs');
await esbuild.build({
  entryPoints: ['tests/entries/mapsEntry.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: out,
  define: { 'import.meta.env': JSON.stringify({}) }
});
const { directionsUrl, destinationFor, openDirections } = await import(out + '?t=' + Date.now());

let failures = 0;
const log = [];
const check = (label, cond, detail = '') => {
  if (cond) log.push('  PASS  ' + label);
  else {
    failures += 1;
    log.push('  FAIL  ' + label + (detail ? '  -> ' + detail : ''));
  }
};

// --- coordinates preferred ---------------------------------------------------
const withCoords = {
  name: 'Ramen House',
  address: 'Ramen House, Koramangala, Bengaluru, India',
  lat: 12.9345,
  lon: 77.6265
};
const coordUrl = directionsUrl(withCoords);
check('Uses Google Maps URLs with api=1', coordUrl.startsWith('https://www.google.com/maps/dir/?api=1'), coordUrl);
check('Destination is the restaurant coordinates', coordUrl.includes(encodeURIComponent('12.9345,77.6265')), coordUrl);
check('No origin is sent, so no GPS permission is needed', !coordUrl.includes('origin='), coordUrl);

// --- address fallback --------------------------------------------------------
const noCoords = { name: 'Meghana Foods', address: 'Residency Road, Bengaluru 560025' };
const addrUrl = directionsUrl(noCoords);
check('Falls back to name and address', addrUrl.includes(encodeURIComponent('Meghana Foods, Residency Road, Bengaluru 560025')), addrUrl);
check('Destination is the selected restaurant, not a generic map', addrUrl.includes('destination='), addrUrl);

const areaOnly = { name: 'Dosa Diaries', area: 'HSR Layout' };
check('Uses area when no address exists', directionsUrl(areaOnly).includes(encodeURIComponent('Dosa Diaries, HSR Layout')));

// --- encoding ----------------------------------------------------------------
const awkward = { name: "Rahul's Café & Grill", address: '12th Main, HSR Layout, Bengaluru' };
const awkwardUrl = directionsUrl(awkward);
check('Ampersand is encoded, not left to split the query', !awkwardUrl.split('destination=')[1].includes('&'), awkwardUrl);
check('Non-ASCII characters are encoded', awkwardUrl.includes('%C3%A9'), awkwardUrl);
// An apostrophe is a legal query character and encodeURIComponent leaves it
// alone; what matters is that it cannot terminate or split the parameter.
check('Apostrophe cannot break the query', !awkwardUrl.split('destination=')[1].includes('?'), awkwardUrl);
check('Spaces are encoded', !awkwardUrl.includes(' '), awkwardUrl);

// --- no secrets --------------------------------------------------------------
const allUrls = [coordUrl, addrUrl, awkwardUrl, directionsUrl(areaOnly)];
check('No API key of any kind in the URL', allUrls.every((u) => !/key=|apiKey|AIza|GEOAPIFY/i.test(u)), allUrls.join(' '));
check('Never contacts a metered Google endpoint', allUrls.every((u) => !u.includes('maps.googleapis.com')), allUrls.join(' '));
check('Never contacts Geoapify', allUrls.every((u) => !/geoapify/i.test(u)));

// --- absent location ---------------------------------------------------------
check('No location yields no link', directionsUrl({ name: '' }) === null);
check('Null place yields no link', directionsUrl(null) === null);
check('destinationFor returns null with nothing to go on', destinationFor({}) === null);
check('Partial coordinates fall back to text', directionsUrl({ name: 'X', area: 'Y', lat: 12.9 }).includes(encodeURIComponent('X, Y')));

// --- open behaviour ----------------------------------------------------------
let opened = null;
global.window = { open: (url, target, features) => { opened = { url, target, features }; } };
const result = openDirections(withCoords);
check('openDirections reports success', result === true);
check('Opens in a new tab', opened.target === '_blank', String(opened?.target));
check('Uses noopener', /noopener/.test(opened.features || ''), String(opened?.features));
opened = null;
check('openDirections does nothing without a location', openDirections({}) === false && opened === null);

fs.rmSync(out, { force: true });
console.log(log.join('\n'));
console.log(failures === 0 ? '\nALL MAPS TESTS PASSED' : '\n' + failures + ' MAPS TEST(S) FAILED');
process.exit(failures ? 1 : 0);
