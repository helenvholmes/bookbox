// iOS home screen launch images. Shared by the root layout and scripts/generate-icons.mts.
// [css width, css height, device pixel ratio]
export const SPLASH_DEVICES: [number, number, number][] = [
  [440, 956, 3], // iPhone 16/17 Pro Max
  [402, 874, 3], // iPhone 16/17 Pro
  [430, 932, 3], // iPhone 14/15 Pro Max, 15/16 Plus
  [393, 852, 3], // iPhone 14/15 Pro, 15/16
  [428, 926, 3], // iPhone 12–13 Pro Max, 14 Plus
  [390, 844, 3], // iPhone 12–14
  [375, 812, 3], // iPhone X–11 Pro, 12/13 mini
  [414, 896, 2], // iPhone XR, 11
  [375, 667, 2], // iPhone SE
  [820, 1180, 2], // iPad Air
  [1024, 1366, 2], // iPad Pro 12.9"
];

// One of each for the system's light and dark settings, on that setting's page colour (src/app/globals.css).
export const SPLASH_SCHEMES = ["dark", "light"] as const;
export type SplashScheme = (typeof SPLASH_SCHEMES)[number];

export const splashFile = (w: number, h: number, r: number, scheme: SplashScheme = "dark") =>
  `splash-${w * r}x${h * r}${scheme === "light" ? "-light" : ""}.png`;
