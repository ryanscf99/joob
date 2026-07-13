"use client";

import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { CatBubbleRow, PawDot } from "@/components/CatDecor";
import { JOOB_LOGO_SM, pickCats } from "@/lib/cat-gallery";

export function Footer() {
  const { tr, lang } = useApp();
  const strip = pickCats(8, 12);

  return (
    <footer className="mt-auto border-t border-joob-coral/15 bg-gradient-to-b from-joob-cocoa to-[#2a1f1c] text-white/85">
      {/* Cat photo ribbon — shorter on phones */}
      <div className="flex h-12 sm:h-16 overflow-hidden opacity-90">
        {strip.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            className="h-full w-1/4 sm:w-[12.5%] object-cover"
            loading="lazy"
          />
        ))}
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={JOOB_LOGO_SM}
                alt="jOOB"
                className="h-12 w-12 rounded-full border-2 border-joob-coral/50 object-cover shadow-cat"
              />
              <div>
                <div className="text-xl font-extrabold text-white">
                  j<span className="text-joob-pink">OO</span>B
                </div>
                <p className="text-xs text-white/55">{tr("brandFull")}</p>
              </div>
            </div>
            <p className="mt-3 max-w-lg text-xs leading-relaxed text-white/45">
              {tr("footerNote")}
            </p>
            <div className="mt-4">
              <CatBubbleRow
                seeds={["f1", "f2", "f3", "f4", "f5"]}
                size={32}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-3 text-sm">
            <Link href="/jobs" className="min-h-[40px] inline-flex items-center hover:text-joob-pink transition">
              {tr("navJobs")}
            </Link>
            <Link href="/match" className="min-h-[40px] inline-flex items-center hover:text-joob-pink transition">
              {tr("navMatch")}
            </Link>
            <Link href="/dashboard" className="min-h-[40px] inline-flex items-center hover:text-joob-pink transition">
              {tr("navDashboard")}
            </Link>
            <Link href="/youth" className="min-h-[40px] inline-flex items-center hover:text-joob-pink transition">
              {tr("navYouth")}
            </Link>
            <Link href="/install" className="min-h-[40px] inline-flex items-center font-semibold text-joob-pink hover:text-white transition">
              {lang === "zh" ? "iPhone App" : "iPhone App"}
            </Link>
            <Link href="/about" className="min-h-[40px] inline-flex items-center hover:text-joob-pink transition">
              {tr("navAbout")}
            </Link>
            <a
              href="https://data.gov.mo/"
              target="_blank"
              rel="noreferrer"
              className="min-h-[40px] inline-flex items-center hover:text-joob-pink transition"
            >
              data.gov.mo ↗
            </a>
            <a
              href="https://www.dsal.gov.mo/"
              target="_blank"
              rel="noreferrer"
              className="min-h-[40px] inline-flex items-center hover:text-joob-pink transition"
            >
              DSAL ↗
            </a>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-white/35">
          <span>
            © {new Date().getFullYear()} jOOB · Macau Job Problem ·{" "}
            {lang === "zh" ? "研究試點" : "research pilot"}
          </span>
          <span className="inline-flex items-center gap-1">
            made with <PawDot /> ginger orange · for Macau youth
          </span>
        </div>
      </div>
    </footer>
  );
}
