import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { getFacets } from "@/lib/books";
import { SPLASH_DEVICES, splashFile } from "@/lib/splash";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "BookBox", template: "%s · BookBox" },
  description: "My reading log",
  applicationName: "BookBox",
  appleWebApp: {
    capable: true,
    title: "BookBox",
    statusBarStyle: "black-translucent",
    startupImage: splashScreens(),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111214",
  colorScheme: "dark",
};

function splashScreens() {
  return SPLASH_DEVICES.map(([w, h, r]) => ({
    url: `/splash/${splashFile(w, h, r)}`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
  }));
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { years } = await getFacets();
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable} antialiased`}>
      <body className="min-h-dvh md:flex">
        <Suspense>
          <Nav years={years} />
        </Suspense>
        <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] md:px-10 md:pt-8 md:pb-12">{children}</main>
      </body>
    </html>
  );
}
