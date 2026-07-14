import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CatTVHost } from "@/components/CatTVHost";
import { MobileTabBar } from "@/components/MobileTabBar";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { PwaRegister } from "@/components/PwaRegister";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { DocumentLanguage } from "@/components/DocumentLanguage";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "jOOB · Macau youth job buddy",
    template: "%s · jOOB",
  },
  description:
    "jOOB (Jobs Out Of the Blue) — cute cat-themed Macau youth employment bridge: open data, smart match, employer workforce transparency. Install on iPhone Home Screen.",
  applicationName: "jOOB",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "jOOB",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/brand/favicon-ico.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/joob-logo-256.png", sizes: "256x256", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180" }],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F08A3C" },
    { media: "(prefers-color-scheme: dark)", color: "#E06A1A" },
  ],
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans flex min-h-screen flex-col joob-app-shell`}
      >
        <ErrorBoundary>
          <AuthProvider>
            <AppProvider>
              <DocumentLanguage />
              <a href="#main-content" className="skip-link">
                Skip to main content
              </a>
              <Nav />
              <main
                id="main-content"
                className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
              >
                <ErrorBoundary fallbackTitle="This page crashed">
                  {children}
                </ErrorBoundary>
              </main>
              <Footer />
              <MobileTabBar />
              <InstallAppBanner />
              <CatTVHost />
              <PwaRegister />
            </AppProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
