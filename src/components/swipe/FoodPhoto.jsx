import { cx } from '../primitives/cx';
import s from './FoodPhoto.module.css';

/*
 * Stands in for real food photography:
 * a warm gradient plus an illustrated motif chosen from the item's cuisine, so
 * every card in the deck reads as a different plate of food.
 *
 * When real shots land, pass `src` and the <img> takes over — nothing else in
 * the swipe deck has to change.
 */

// Includes the cuisine labels derived from OpenStreetMap category keys
// (catering.restaurant.<cuisine>), which is what a live provider returns.
const CUISINE_MOTIF = {
  Indian: 'thali',
  Italian: 'pizza',
  Burger: 'burger',
  Kebab: 'kebab',
  Asian: 'noodles',
  Thai: 'noodles',
  Noodle: 'noodles',
  Sushi: 'noodles',
  Regional: 'thali',
  'Ice Cream': 'dessert',
  Coffee_Shop: 'dessert',
  Bakery: 'dessert',
  Seafood: 'kebab',
  Barbecue: 'kebab',
  Chicken: 'kebab',
  Sandwich: 'burger',
  Restaurant: 'thali',
  Japanese: 'noodles',
  Ramen: 'noodles',
  Chinese: 'noodles',
  Burmese: 'noodles',
  Hyderabadi: 'biryani',
  Biryani: 'biryani',
  Andhra: 'biryani',
  'South Indian': 'dosa',
  Breakfast: 'dosa',
  Awadhi: 'kebab',
  Kebab: 'kebab',
  Grill: 'kebab',
  'Middle Eastern': 'roll',
  'North Indian': 'thali',
  Vegetarian: 'thali',
  Cafe: 'dessert',
  Bakery: 'dessert',
  Desserts: 'dessert',
  Pizza: 'pizza',
  Dosa: 'dosa',
  American: 'burger',
  Burgers: 'burger'
};

const PALETTES = {
  noodles: ['#F7DDA9', '#DF9440'],
  biryani: ['#F5CE86', '#D07F2E'],
  dosa: ['#F8E7BE', '#DFAE55'],
  kebab: ['#F2CE95', '#C87438'],
  thali: ['#F6DFAB', '#D9A047'],
  dessert: ['#F7E2CE', '#D79A62'],
  pizza: ['#F2D199', '#C86A2E'],
  burger: ['#F4D096', '#C97C3A'],
  roll: ['#F5DCB0', '#CA8C4C']
};

/* --- per-item backdrop variation ---------------------------------------
 * Nine motifs cover twelve cards, so two biryani places would otherwise be
 * pixel-identical. Nudging only the backdrop hue/lightness (never the food
 * itself) by a hash of the item id makes each card feel like its own shot.
 */
function hash(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function shift(hex, dh, dl) {
  const [h, s, l] = hexToHsl(hex);
  const hh = (((h + dh) % 360) + 360) % 360;
  const ll = Math.max(0, Math.min(100, l + dl));
  return `hsl(${hh.toFixed(1)} ${s.toFixed(1)}% ${ll.toFixed(1)}%)`;
}

export function motifFor(item) {
  const list = item?.cuisines || [];
  for (const c of list) if (CUISINE_MOTIF[c]) return CUISINE_MOTIF[c];
  return 'noodles';
}

const steam = (x) => (
  <path
    key={'steam' + x}
    d={`M${x} 74 c -9 -13 9 -20 0 -33 c -8 -12 6 -18 0 -28`}
    fill="none"
    stroke="#FFFFFF"
    strokeOpacity="0.5"
    strokeWidth="5"
    strokeLinecap="round"
  />
);

const MOTIFS = {
  noodles: () => (
    <>
      {[122, 160, 198].map(steam)}
      <ellipse cx="160" cy="300" rx="118" ry="20" fill="#000" opacity="0.14" />
      <path d="M42 150 h236 a118 118 0 0 1 -236 0 z" fill="#2E2620" />
      <ellipse cx="160" cy="150" rx="118" ry="30" fill="#3A322A" />
      <ellipse cx="160" cy="152" rx="102" ry="24" fill="#C0722A" />
      <path d="M96 152 q22 -16 44 0 t44 0 t44 0" fill="none" stroke="#F3D89B" strokeWidth="9" strokeLinecap="round" />
      <path d="M104 166 q22 -14 44 0 t44 0 t36 -2" fill="none" stroke="#EBCB88" strokeWidth="8" strokeLinecap="round" />
      <ellipse cx="122" cy="150" rx="24" ry="17" fill="#FFF6E4" />
      <ellipse cx="122" cy="150" rx="11" ry="9" fill="#F0A93B" />
      <rect x="176" y="128" width="42" height="30" rx="4" fill="#26262F" transform="rotate(-8 197 143)" />
      {[
        [150, 138],
        [206, 164],
        [136, 168]
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" fill="#7FA05A" />
      ))}
      <rect x="196" y="88" width="104" height="9" rx="4" fill="#8A6A45" transform="rotate(24 248 92)" />
      <rect x="196" y="102" width="104" height="9" rx="4" fill="#7A5C3C" transform="rotate(24 248 106)" />
    </>
  ),

  biryani: () => (
    <>
      {[134, 176].map(steam)}
      <ellipse cx="160" cy="298" rx="112" ry="18" fill="#000" opacity="0.14" />
      <path d="M56 158 h208 v58 a104 104 0 0 1 -208 0 z" fill="#7C5233" />
      <path d="M56 158 h208 v14 a104 104 0 0 1 -208 0 z" fill="#8C6239" />
      <ellipse cx="160" cy="158" rx="104" ry="26" fill="#5E3D26" />
      <ellipse cx="160" cy="156" rx="92" ry="22" fill="#F7EEDC" />
      <path d="M78 152 q34 -34 82 -34 t82 34 z" fill="#F2E4C9" />
      <path d="M104 140 q26 -22 56 -22 t56 22 z" fill="#E8B45C" opacity="0.85" />
      {[
        [128, 142, 9],
        [186, 138, 8],
        [158, 130, 7]
      ].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#B4402C" opacity="0.85" />
      ))}
      {[
        [112, 158],
        [206, 152],
        [166, 146]
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="11" ry="4" fill="#FFFDF6" transform={`rotate(${i * 40 - 20} ${x} ${y})`} />
      ))}
      <circle cx="146" cy="150" r="7" fill="#5B4130" />
      <path d="M198 168 q14 -12 26 -2" fill="none" stroke="#7FA05A" strokeWidth="6" strokeLinecap="round" />
    </>
  ),

  dosa: () => (
    <>
      <ellipse cx="160" cy="296" rx="122" ry="18" fill="#000" opacity="0.12" />
      <rect x="14" y="86" width="292" height="168" rx="30" fill="#4C6B57" />
      <path d="M160 86 v168" stroke="#415C4B" strokeWidth="5" />
      <path d="M40 110 q120 24 240 0 M40 230 q120 -24 240 0" stroke="#568069" strokeWidth="3" fill="none" opacity="0.7" />
      <g transform="rotate(-24 160 172)">
        <rect x="42" y="140" width="236" height="66" rx="33" fill="#C98A3C" />
        <rect x="42" y="140" width="236" height="44" rx="22" fill="#DFA44E" />
        <rect x="52" y="146" width="216" height="20" rx="10" fill="#EFBE72" />
        <path d="M96 152 q10 24 0 44 M148 150 q10 26 0 46 M200 152 q10 24 0 44" stroke="#B87A31" strokeWidth="4" fill="none" opacity="0.8" />
        <ellipse cx="278" cy="173" rx="10" ry="33" fill="#B87A31" />
      </g>
      <g>
        <circle cx="74" cy="228" r="30" fill="#E9E3D6" />
        <circle cx="74" cy="228" r="23" fill="#FBF7F1" />
        <circle cx="152" cy="242" r="30" fill="#6C8F58" />
        <circle cx="152" cy="242" r="23" fill="#84A96A" />
        <circle cx="232" cy="228" r="32" fill="#B4552A" />
        <circle cx="232" cy="228" r="24" fill="#CE6C31" />
        <circle cx="226" cy="222" r="5" fill="#F2C57C" />
        <circle cx="240" cy="232" r="4" fill="#F2C57C" />
      </g>
    </>
  ),

  kebab: () => (
    <>
      <ellipse cx="160" cy="296" rx="118" ry="18" fill="#000" opacity="0.12" />
      <circle cx="160" cy="176" r="118" fill="#F5EDE0" />
      <circle cx="160" cy="176" r="98" fill="#EFE4D3" />
      {[
        [-16, 118],
        [0, 168],
        [16, 218]
      ].map(([rot, y], i) => (
        <g key={i} transform={`rotate(${rot} 160 ${y})`}>
          <rect x="66" y={y - 17} width="188" height="34" rx="17" fill="#8E4A2E" />
          <rect x="66" y={y - 17} width="188" height="13" rx="7" fill="#A25A37" />
          <path
            d={`M92 ${y - 14} v28 M132 ${y - 15} v30 M172 ${y - 14} v28 M212 ${y - 15} v30`}
            stroke="#5C2F1E"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </g>
      ))}
      <path d="M228 122 a26 26 0 0 1 34 30" fill="none" stroke="#D9C3D8" strokeWidth="8" strokeLinecap="round" />
      <path d="M64 232 a24 24 0 0 0 30 26" fill="none" stroke="#D9C3D8" strokeWidth="8" strokeLinecap="round" />
      <path d="M226 236 a30 30 0 0 0 42 -22 z" fill="#A8C060" />
      <path d="M226 236 a30 30 0 0 0 42 -22" fill="none" stroke="#C9D98A" strokeWidth="5" />
    </>
  ),

  thali: () => (
    <>
      <ellipse cx="160" cy="298" rx="118" ry="18" fill="#000" opacity="0.12" />
      <circle cx="160" cy="172" r="126" fill="#DCD7CE" />
      <circle cx="160" cy="172" r="112" fill="#E7E3DC" />
      <circle cx="160" cy="172" r="96" fill="#EFECE6" />
      <ellipse cx="160" cy="196" rx="46" ry="34" fill="#FBF7F1" />
      <ellipse cx="160" cy="188" rx="34" ry="24" fill="#FFFFFF" />
      <circle cx="160" cy="184" r="10" fill="#E8B45C" />
      {[
        ['#C4602A', 98, 130],
        ['#7FA05A', 160, 106],
        ['#B4402C', 222, 130],
        ['#E8B45C', 240, 196],
        ['#8B5A6B', 80, 196]
      ].map(([fill, x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="27" fill="#D6D1C8" />
          <circle cx={x} cy={y} r="22" fill={fill} />
          <circle cx={x - 6} cy={y - 6} r="5" fill="#FFFFFF" opacity="0.3" />
        </g>
      ))}
      <circle cx="160" cy="248" r="30" fill="#E0BE86" />
      <circle cx="160" cy="248" r="24" fill="#EBCF9F" />
    </>
  ),

  dessert: () => (
    <>
      <ellipse cx="160" cy="292" rx="104" ry="18" fill="#000" opacity="0.12" />
      <ellipse cx="160" cy="252" rx="118" ry="30" fill="#F5EDE0" />
      <ellipse cx="160" cy="246" rx="98" ry="24" fill="#FBF7F1" />
      <path d="M104 236 l16 -84 h80 l16 84 z" fill="#E8B45C" />
      <path d="M104 236 l6 -30 h100 l6 30 z" fill="#D89B3F" />
      <ellipse cx="160" cy="152" rx="40" ry="14" fill="#F2C876" />
      <path d="M124 152 q36 26 72 0 q-6 32 -36 32 t-36 -32 z" fill="#A9612A" opacity="0.55" />
      <circle cx="160" cy="140" r="15" fill="#FFF7EC" />
      <circle cx="160" cy="128" r="11" fill="#B4402C" />
      <path d="M160 118 q10 -14 22 -12" fill="none" stroke="#5F7F4A" strokeWidth="5" strokeLinecap="round" />
      <path d="M222 214 q22 14 34 34" fill="none" stroke="#A9612A" strokeWidth="7" strokeLinecap="round" opacity="0.7" />
    </>
  ),

  pizza: () => (
    <>
      <ellipse cx="160" cy="298" rx="112" ry="18" fill="#000" opacity="0.12" />
      <circle cx="160" cy="170" r="126" fill="#D9A85C" />
      <circle cx="160" cy="170" r="116" fill="#E2B168" />
      <circle cx="160" cy="170" r="98" fill="#B4402C" />
      <circle cx="160" cy="170" r="92" fill="#F6E3AE" opacity="0.92" />
      {[
        [118, 130],
        [204, 142],
        [136, 216],
        [212, 208],
        [162, 168]
      ].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="19" fill="#B4402C" />
          <circle cx={x - 4} cy={y - 4} r="6" fill="#C8523A" />
        </g>
      ))}
      {[
        [96, 184],
        [186, 108],
        [232, 176]
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="15" ry="9" fill="#5F7F4A" transform={`rotate(${i * 50} ${x} ${y})`} />
      ))}
      <path d="M160 78 l58 100 l-58 100" fill="none" stroke="#E2B168" strokeWidth="6" opacity="0.75" />
    </>
  ),

  burger: () => (
    <>
      <ellipse cx="160" cy="292" rx="106" ry="18" fill="#000" opacity="0.12" />
      <path d="M40 152 a120 90 0 0 1 240 0 z" fill="#E0A85A" />
      {[
        [110, 108],
        [160, 92],
        [210, 108],
        [136, 128],
        [188, 126]
      ].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx="8" ry="5" fill="#FBF3E2" transform={`rotate(${i * 24} ${x} ${y})`} />
      ))}
      <path d="M44 158 q116 26 232 0 q-6 22 -116 22 t-116 -22 z" fill="#7FA05A" />
      <rect x="48" y="176" width="224" height="34" rx="14" fill="#F0B03C" />
      <rect x="42" y="196" width="236" height="42" rx="18" fill="#6B3A24" />
      <rect x="42" y="196" width="236" height="14" rx="7" fill="#7C462B" />
      <path d="M48 240 a112 40 0 0 0 224 0 z" fill="#D89B4E" />
    </>
  ),

  roll: () => (
    <>
      <ellipse cx="160" cy="292" rx="112" ry="18" fill="#000" opacity="0.12" />
      <g transform="rotate(-28 160 170)">
        <rect x="70" y="60" width="118" height="228" rx="46" fill="#E3C795" />
        <rect x="70" y="60" width="118" height="228" rx="46" fill="#EBD3A5" />
        <path d="M80 120 q54 18 100 0 M80 168 q54 18 100 0 M80 216 q54 18 100 0" stroke="#D8BB84" strokeWidth="5" fill="none" />
        <path d="M70 196 h118 v46 a59 46 0 0 1 -118 0 z" fill="#D9D3C9" />
        <path d="M84 206 l6 40 M114 200 l3 46 M146 200 l-3 46 M176 206 l-6 40" stroke="#BEB7AB" strokeWidth="4" />
        <ellipse cx="129" cy="66" rx="59" ry="20" fill="#C98A4C" />
        <ellipse cx="129" cy="62" rx="52" ry="16" fill="#B4633A" />
        <ellipse cx="108" cy="60" rx="17" ry="9" fill="#C97A47" transform="rotate(-18 108 60)" />
        <ellipse cx="150" cy="64" rx="15" ry="8" fill="#A9552F" transform="rotate(14 150 64)" />
        <path d="M96 56 q20 -9 38 3" stroke="#7FA05A" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M138 54 q18 -7 30 5" stroke="#FBF7F1" strokeWidth="7" fill="none" strokeLinecap="round" />
      </g>
    </>
  )
};

export function FoodPhoto({ item, className, children }) {
  const motif = motifFor(item);
  const [from, to] = PALETTES[motif];
  const seed = hash(item?.id || item?.name || motif);
  const dh = (seed % 17) - 8; // +/- 8 degrees
  const dl = ((seed >> 5) % 9) - 4; // +/- 4% lightness
  const angle = 150 + ((seed >> 9) % 5) * 8;
  return (
    <div
      className={cx(s.photo, className)}
      style={{ '--from': shift(from, dh, dl), '--to': shift(to, dh, dl), '--angle': angle + 'deg' }}
      role="img"
      aria-label={item?.photoLabel ? item.photoLabel.toLowerCase() : 'Food photograph'}
    >
      <svg className={s.art} viewBox="0 0 320 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {MOTIFS[motif]()}
      </svg>
      <span className={s.sheen} aria-hidden="true" />
      <span className={s.vignette} aria-hidden="true" />
      {children}
    </div>
  );
}
