import type { Metadata, Viewport } from "next";
import { Anton } from "next/font/google";
import { Providers } from "./Providers";
import { RegisterSW } from "@/features/pwa/RegisterSW";
import "./globals.css";

/**
 * Anton — the masthead face. One weight exists, which suits us: the whole display system is a single
 * condensed uppercase cut. Self-hosted by next/font, so nothing is fetched from Google at runtime
 * and the app still renders correctly on a pitch with no signal.
 */
const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-anton",
  fallback: ["Arial Narrow", "sans-serif"],
});

export const metadata: Metadata = {
  title: "NextOn — everyone plays, no arguments",
  description:
    "The free app that tracks every kid's minutes live and tells the coach when to sub and who. Football and basketball. No account, works offline.",
  applicationName: "NextOn",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "NextOn" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // so safe-area insets are available to the ink bars
  themeColor: "#141311",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={anton.variable}>
      <body>
        <Providers>{children}</Providers>
        {/* public/sw.js shipped from day one but was never registered — offline launch
            silently never engaged. Found by the 2026-08-12 link/asset audit. */}
        <RegisterSW />
      </body>
    </html>
  );
}
