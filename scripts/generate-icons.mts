/**
 * Renders the app icon and iOS launch screens.  npm run generate:icons
 *
 *   public/icons/icon-{192,512}.png, maskable-512.png   web app manifest
 *   src/app/icon.png, src/app/apple-icon.png             <link rel="icon"> / home screen icon
 *   public/splash/splash-WxH.png, splash-WxH-light.png   iOS launch images, dark and light
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { SPLASH_DEVICES, SPLASH_SCHEMES, type SplashScheme, splashFile } from "../src/lib/splash";

const ACCENT = "#1d1e22";
const ACCENT_DARK = "#0e0f11";
const INK = "#ececed";
// The page and text colours of each setting (--paper and --ink in src/app/globals.css).
const SPLASH_COLORS: Record<SplashScheme, { paper: string; ink: string }> = {
  dark: { paper: "#111214", ink: "#ececed" },
  light: { paper: "#f8f8f6", ink: "#1b1c1f" },
};

// Pixel-art book spines on a shelf (the tall one smiling), after Streamline's "archive books" pixel icon
// (streamline-pixel:content-files-archive-books-1, CC BY 4.0, https://github.com/webalys-hq/streamline-vectors).
// One character per pixel: # is drawn, . is empty.
const SPINES = [
  ".....................",
  "...########..........",
  "...#......#..........",
  "...########..........",
  "...#......####.......",
  "...#......#..######..",
  "####......#####...#..",
  "#..#......#..##...#..",
  "####.#..#.#..######..",
  "#..#......#..##...#..",
  "#..#.#..#.#..###..##.",
  "#..#..##..#..#.#...#.",
  "#..#......#..#.#...#.",
  "#..#......#..#.#...#.",
  "#..#......#..#.#...#.",
  "#..#......####.##..##",
  "#..#......#..#..#...#",
  "####......#..#..#####",
  "#..########..#..#...#",
  "#..#......#..#..#...#",
  "##############..#####",
];

// A full-bleed square (iOS and Android apply their own rounding). The glyph is 576/1024 wide, so its
// corners stay inside the 80% circle that maskable icons are cropped to.
function iconSvg({ rounded = false } = {}) {
  const size = 576;
  const offset = (1024 - size) / 2;
  const pixels = SPINES.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? `M${x} ${y}h1v1h-1Z` : ""))).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT_DARK}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" ${rounded ? 'rx="230"' : ""} fill="url(#bg)"/>
  <path fill="${INK}" transform="translate(${offset} ${offset}) scale(${size / SPINES.length})" d="${pixels}"/>
</svg>`;
}

function splashSvg(w: number, h: number, scheme: SplashScheme) {
  const { paper, ink } = SPLASH_COLORS[scheme];
  const size = Math.round(Math.min(w, h) * 0.28);
  const x = Math.round((w - size) / 2);
  const y = Math.round(h / 2 - size * 0.75);
  const fontSize = Math.round(size * 0.2);
  const icon = iconSvg({ rounded: true }).replace("<svg ", `<svg x="${x}" y="${y}" width="${size}" height="${size}" `);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${paper}"/>
  ${icon}
  <text x="${w / 2}" y="${y + size + fontSize * 1.9}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
        font-weight="400" font-size="${fontSize}" fill="${ink}">BookBox</text>
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
  for (const scheme of SPLASH_SCHEMES) {
    const [pw, ph] = [w * r, h * r];
    await sharp(Buffer.from(splashSvg(pw, ph, scheme))).png({ compressionLevel: 9 }).toFile(out(`public/splash/${splashFile(w, h, r, scheme)}`));
  }
}

console.log(`Wrote 5 icons and ${SPLASH_DEVICES.length * SPLASH_SCHEMES.length} launch screens.`);
