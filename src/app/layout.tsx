import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { CatTVHost } from "@/components/CatTVHost";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "jOOB · Macau youth job buddy",
  description:
    "jOOB (Jobs Out Of the Blue) — cute cat-themed Macau youth employment bridge: open data, smart match, employer workforce transparency.",
  icons: {
    icon: "/brand/favicon-ico.png",
    apple: "/brand/joob-logo-256.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans flex min-h-screen flex-col`}>
        <AppProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
          <CatTVHost />
        </AppProvider>
      </body>
    </html>
  );
}
