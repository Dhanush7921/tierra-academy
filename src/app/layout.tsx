import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Unbounded, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { DemoBanner } from "@/components/ui/demo-banner";

const display = Unbounded({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-unbounded", display: "swap" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "Tierra Academy — Learn. Build. Automate.", template: "%s · Tierra Academy" },
  description: "Tierra Academy by Tierra Automation: live and recorded engineering courses in electronics, robotics, IoT, embedded systems, electrical and mechanical engineering.",
  applicationName: "Tierra Academy",
  openGraph: { type: "website", siteName: "Tierra Academy", title: "Tierra Academy — Learn. Build. Automate.", images: ["/brand/tierra-automation-logo-512.webp"] },
  robots: process.env.APP_MODE === "production" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#05080f" }, { media: "(prefers-color-scheme: light)", color: "#fbfaf7" }],
  width: "device-width",
  initialScale: 1,
};

const THEME_BOOT = `(function(){try{var t=localStorage.getItem("ta_theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const theme = jar.get("ta_theme")?.value === "light" ? "light" : "dark";
  const motion = jar.get("ta_motion")?.value === "reduced" ? "reduced" : "full";
  return (
    <html lang="en-IN" data-theme={theme} data-motion={motion} className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Runs before first paint: restores the saved theme (also after client-side navigation / cookie-path changes) so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only z-[100] rounded-lg bg-brand px-4 py-2 text-on-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
        <DemoBanner />
        {children}
      </body>
    </html>
  );
}
