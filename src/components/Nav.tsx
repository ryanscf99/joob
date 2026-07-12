"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Languages } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JOOB_LOGO_SM } from "@/lib/cat-gallery";
import clsx from "clsx";

/** Seeker-focused nav — employer portal & compliance wizard hidden for now */
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

  return (
    <header className="sticky top-0 z-50 border-b border-joob-coral/15 bg-white/85 backdrop-blur-md shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="relative flex h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-joob-coral/40 bg-joob-peach shadow-cat transition group-hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={JOOB_LOGO_SM}
              alt="jOOB"
              className="h-full w-full object-cover"
            />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-extrabold tracking-tight text-joob-cocoa group-hover:text-joob-coral transition">
              j<span className="text-joob-coral">OO</span>B
            </div>
            <div className="hidden text-[10px] text-joob-cocoaSoft sm:block max-w-[200px] truncate">
              {lang === "zh" ? "澳青求職夥伴 · 喵" : "youth job buddy · meow"}
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "rounded-full px-3 py-1.5 text-sm transition",
                pathname === l.href
                  ? "bg-joob-coral text-white font-semibold shadow-cat"
                  : "text-joob-cocoaSoft hover:bg-joob-peach hover:text-joob-cocoa"
              )}
            >
              {tr(l.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "zh" : "en")}
            className="inline-flex items-center gap-1.5 rounded-full border border-joob-coral/20 bg-white px-3 py-1.5 text-xs font-semibold text-joob-cocoa shadow-sm hover:border-joob-coral/50 hover:text-joob-coral transition"
            aria-label="Toggle language"
          >
            <Languages className="h-3.5 w-3.5" />
            {tr("lang")}
          </button>
          <button
            type="button"
            className="lg:hidden rounded-full p-2 text-joob-cocoa hover:bg-joob-peach"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-joob-coral/10 bg-white px-4 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "rounded-2xl px-3 py-2.5 text-sm",
                  pathname === l.href
                    ? "bg-joob-sky font-semibold text-joob-coral"
                    : "text-joob-cocoaSoft"
                )}
              >
                {tr(l.key)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
