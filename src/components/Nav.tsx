"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, Languages, Smartphone, UserRound } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JOOB_LOGO_SM } from "@/lib/cat-gallery";
import clsx from "clsx";

/** Seeker-focused nav — primary items also on mobile tab bar */
const links = [
  { href: "/", key: "navHome" as const },
  { href: "/jobs", key: "navJobs" as const },
  { href: "/faculty", key: "navFaculty" as const },
  { href: "/dashboard", key: "navDashboard" as const },
  { href: "/match", key: "navMatch" as const },
  { href: "/youth", key: "navYouth" as const },
  { href: "/about", key: "navAbout" as const },
];

export function Nav() {
  const { lang, setLang, tr } = useApp();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const zh = lang === "zh";

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-joob-coral/15 bg-white/90 backdrop-blur-xl shadow-sm"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:px-4 sm:py-2.5">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 group"
          onClick={() => setOpen(false)}
        >
          <span className="relative flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 overflow-hidden rounded-full border-2 border-joob-coral/40 bg-joob-peach shadow-cat transition group-hover:scale-105 active:scale-95">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={JOOB_LOGO_SM}
              alt="jOOB"
              className="h-full w-full object-cover"
            />
          </span>
          <div className="leading-tight min-w-0">
            <div className="text-base sm:text-lg font-extrabold tracking-tight text-joob-cocoa group-hover:text-joob-coral transition">
              j<span className="text-joob-coral">OO</span>B
            </div>
            <div className="hidden text-[10px] text-joob-cocoaSoft sm:block max-w-[200px] truncate">
              {zh ? "澳青求職夥伴 · 喵" : "youth job buddy · meow"}
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "rounded-full px-3 py-2 text-sm transition min-h-[40px] inline-flex items-center",
                pathname === l.href
                  ? "bg-joob-coral text-white font-semibold shadow-cat"
                  : "text-joob-cocoaSoft hover:bg-joob-peach hover:text-joob-cocoa"
              )}
            >
              {tr(l.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/auth"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-full border border-joob-coral/20 bg-white px-2.5 py-2 text-xs font-semibold text-joob-cocoa"
            aria-label={zh ? "帳戶" : "Account"}
          >
            <UserRound className="h-4 w-4" />
            <span className="hidden sm:inline">{zh ? "帳戶" : "Account"}</span>
          </Link>
          <Link
            href="/install"
            className="hidden sm:inline-flex items-center gap-1 rounded-full border border-joob-coral/25 bg-joob-peach/60 px-2.5 py-1.5 text-[11px] font-bold text-joob-cocoa hover:bg-joob-peach transition"
            title={zh ? "安裝 iPhone App" : "Install iPhone app"}
          >
            <Smartphone className="h-3.5 w-3.5 text-joob-coral" />
            App
          </Link>
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "zh" : "en")}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-joob-coral/20 bg-white px-3 py-2 text-xs font-semibold text-joob-cocoa shadow-sm hover:border-joob-coral/50 hover:text-joob-coral transition active:scale-95"
            aria-label="Toggle language"
          >
            <Languages className="h-3.5 w-3.5" />
            {tr("lang")}
          </button>
          <button
            type="button"
            className="lg:hidden inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-joob-cocoa hover:bg-joob-peach active:bg-joob-peach/80"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? (zh ? "關閉選單" : "Close menu") : zh ? "開啟選單" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile full-screen friendly drawer */}
      {open && (
        <div className="border-t border-joob-coral/10 bg-white/98 px-3 pb-6 pt-2 lg:hidden shadow-soft">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "rounded-2xl px-4 py-3.5 text-base min-h-[48px] flex items-center transition active:scale-[0.99]",
                  pathname === l.href
                    ? "bg-joob-coral text-white font-bold shadow-cat"
                    : "text-joob-cocoaSoft hover:bg-joob-peach/60"
                )}
              >
                {tr(l.key)}
              </Link>
            ))}
            <Link
              href="/install"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex min-h-[48px] items-center gap-2 rounded-2xl border-2 border-joob-coral/30 bg-joob-peach/40 px-4 py-3 text-sm font-bold text-joob-cocoa"
            >
              <Smartphone className="h-5 w-5 text-joob-coral" />
              {zh ? "安裝 iPhone App" : "Install iPhone App"}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
