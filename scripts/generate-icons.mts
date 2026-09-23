/**
 * Renders the app icon and iOS launch screens.  npm run generate:icons
 *
 *   public/icons/icon-{192,512}.png, maskable-512.png   web app manifest
 *   src/app/icon.png, src/app/apple-icon.png             <link rel="icon"> / home screen icon
 *   public/splash/splash-WxH.png                         iOS launch images
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SPLASH_DEVICES, splashFile } from "../src/lib/splash";

const ACCENT = "#2b2d32";
const ACCENT_DARK = "#121315";
const PAPER = "#111214";

// Books standing in a box, on a full-bleed square (iOS and Android apply their own rounding).
// Everything important sits inside the central 80% so maskable crops are safe.
function iconSvg({ rounded = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT_DARK}"/>
    </linearGradient>
    <linearGradient id="box" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#44464d"/>
      <stop offset="1" stop-color="#2a2c31"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" ${rounded ? 'rx="230"' : ""} fill="url(#bg)"/>

  <!-- back rim of the box -->
  <rect x="236" y="548" width="552" height="52" rx="14" fill="#000000" opacity="0.5"/>

  <!-- books -->
  <g>
    <rect x="290" y="330" width="118" height="300" rx="14" fill="#e9e2d0"/>
    <rect x="290" y="382" width="118" height="16" fill="#c9c0a8"/>
    <rect x="290" y="560" width="118" height="16" fill="#c9c0a8"/>

    <rect x="424" y="248" width="138" height="382" rx="14" fill="#f4f4f5"/>
    <rect x="452" y="312" width="82" height="14" rx="7" fill="#8b8d93" opacity="0.9"/>
    <rect x="452" y="340" width="56" height="14" rx="7" fill="#8b8d93" opacity="0.5"/>

    <g transform="rotate(11 650 630)">
      <rect x="590" y="318" width="120" height="312" rx="14" fill="#7a7d85"/>
      <rect x="590" y="372" width="120" height="14" fill="#62656c"/>
      <rect x="590" y="400" width="120" height="14" fill="#62656c"/>
    </g>
  </g>

  <!-- front of the box -->
  <path d="M214 580 H810 L786 800 Q782 836 746 836 H278 Q242 836 238 800 Z" fill="url(#box)"/>
  <rect x="432" y="660" width="160" height="56" rx="14" fill="#ffffff" opacity="0.08"/>
</svg>`;
}

function splashSvg(w: number, h: number) {
  const size = Math.round(Math.min(w, h) * 0.28);
  const x = Math.round((w - size) / 2);
  const y = Math.round(h / 2 - size * 0.75);
  const fontSize = Math.round(size * 0.2);
  const icon = iconSvg({ rounded: true }).replace("<svg ", `<svg x="${x}" y="${y}" width="${size}" height="${size}" `);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${PAPER}"/>
  ${icon}
  <text x="${w / 2}" y="${y + size + fontSize * 1.9}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-weight="400" font-size="${fontSize}" fill="#ececed">BookBox</text>
</svg>`;
}

const root = path.resolve(import.meta.dirname, "..");
const out = (p: string) => {
  const file = path.join(root, p);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
};
const png = (svg: string, size: number, file: string) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(out(file));

await Promise.all([
  png(iconSvg(), 192, "public/icons/icon-192.png"),
  png(iconSvg(), 512, "public/icons/icon-512.png"),
  png(iconSvg(), 512, "public/icons/maskable-512.png"),
  png(iconSvg(), 180, "src/app/apple-icon.png"),
  png(iconSvg({ rounded: true }), 96, "src/app/icon.png"),
]);
fs.writeFileSync(out("public/icons/icon.svg"), iconSvg({ rounded: true }));

for (const [w, h, r] of SPLASH_DEVICES) {
  const [pw, ph] = [w * r, h * r];
  await sharp(Buffer.from(splashSvg(pw, ph))).png({ compressionLevel: 9 }).toFile(out(`public/splash/${splashFile(w, h, r)}`));
}

console.log(`Wrote 5 icons and ${SPLASH_DEVICES.length} launch screens.`);
