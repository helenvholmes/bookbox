import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SPLASH_DEVICES, SPLASH_SCHEMES, splashFile } from "@/lib/splash";
import "./globals.css";

// Latin Extended and Vietnamese too, so names like Wiśniewska or Đặng don't switch font partway through. Each
// subset is its own file, downloaded only by pages that use its letters.
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext", "vietnamese"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin", "latin-ext", "vietnamese"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "BookBox", template: "%s · BookBox" },
  description: "My reading log",
  applicationName: "BookBox",
  appleWebApp: {
    capable: true,
    title: "BookBox",
    // iOS draws its own status bar in the page colour (themeColor below), with dark or light text to suit.
    statusBarStyle: "default",
    startupImage: splashScreens(),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The page colour (--paper in globals.css), light or dark with the system.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#111214" },
  ],
  colorScheme: "light dark",
};

// One per device and light or dark setting, so the app opens on the same colour it's about to show.
function splashScreens() {
  return SPLASH_DEVICES.flatMap(([w, h, r]) =>
    SPLASH_SCHEMES.map((scheme) => ({
      url: `/splash/${splashFile(w, h, r, scheme)}`,
      media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
    })),
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} antialiased`}>
      <body className="min-h-dvh">
        {children}
        {/* Page views (no cookies) and real-visit load and responsiveness timings, on Vercel only (the scripts aren't served elsewhere). */}
        {process.env.VERCEL && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
