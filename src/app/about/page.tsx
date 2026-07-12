"use client";

import Link from "next/link";
import { useApp } from "@/context/AppContext";
import {
  CatGalleryStrip,
  CatWall,
  MascotHero,
  PawDot,
  CatVideoLounge,
} from "@/components/CatDecor";
import { JOOB_LOGO, CAT_PHOTOS, CAT_VIDEOS } from "@/lib/cat-gallery";

export default function AboutPage() {
  const { tr, lang } = useApp();
  return (
    <div className="paw-bg">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={JOOB_LOGO}
                alt="jOOB logo"
                className="h-20 w-20 rounded-full border-4 border-white object-cover shadow-cat"
              />
              <div>
                <h1 className="text-3xl font-extrabold text-joob-cocoa">
                  {tr("aboutTitle")}
                </h1>
                <p className="mt-1 text-sm font-semibold text-joob-coral">
                  j<span className="text-joob-cocoa">OO</span>B{" "}
                  <PawDot /> Jobs Out Of the Blue
                </p>
              </div>
            </div>
            <p className="mt-4 text-joob-cocoaSoft leading-relaxed">
              {tr("aboutBody")}
            </p>

            <div className="mt-8 space-y-4 text-sm text-joob-cocoaSoft leading-relaxed joob-card p-6">
              <h2 className="text-lg font-bold text-joob-cocoa">
                {lang === "zh" ? "解決的資訊不對稱" : "Asymmetries we target"}
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  {lang === "zh"
                    ? "青年端：真實需求、合理薪酬、合法暑期／兼職路徑、1+4 產業方向。"
                    : "Youth side: real demand, fair pay, legal summer/part-time paths, 1+4 industry directions."}
                </li>
                <li>
                  {lang === "zh"
                    ? "僱主端：首次求職者訊號、可解釋技能匹配、未成年聘用合規成本。"
                    : "Employer side: first-time worker signals, explainable skill fit, minor-hire compliance cost."}
                </li>
                <li>
                  {lang === "zh"
                    ? "社會端：公開儀表板把 DSEC／data.gov.mo 概念變成雙方共用的「市場真相」。"
                    : "Society side: a public dashboard turns DSEC / data.gov.mo concepts into shared market truth."}
                </li>
              </ul>

              <h2 className="text-lg font-bold text-joob-cocoa pt-4">
                {lang === "zh" ? "為什麼是貓？" : "Why cats?"}
              </h2>
              <p>
                {lang === "zh"
                  ? "jOOB 的吉祥物來自真實的橘白貓（logo.heic）與 pic/others 相簿——可愛不代表不專業，而是讓求職資訊更親切、更願意打開。"
                  : "jOOB’s mascot is a real orange-and-white cat (from logo.heic) plus the whole pic/others pack — cute on purpose, so labour-market truth feels approachable."}
              </p>

              <div className="flex flex-wrap gap-3 pt-4">
                <Link
                  href="/dashboard"
                  className="font-bold text-joob-coral hover:underline"
                >
                  {tr("navDashboard")}
                </Link>
                <Link
                  href="/jobs"
                  className="font-bold text-joob-coral hover:underline"
                >
                  {tr("navJobs")}
                </Link>
                <a
                  href="https://data.gov.mo/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-joob-coral hover:underline"
                >
                  data.gov.mo ↗
                </a>
              </div>
            </div>
          </div>

          <MascotHero useVideo />
        </div>

        <div className="mt-12">
          <CatVideoLounge
            count={6}
            title={lang === "zh" ? "關於我們 · 也關於玩" : "About us · also about play"}
            subtitle={
              lang === "zh"
                ? `平台有 ${CAT_VIDEOS.length} 支貓影片 + ${CAT_PHOTOS.length} 張照片，讓青年求職不只是壓力，也有一點娛樂。`
                : `${CAT_VIDEOS.length} cat clips + ${CAT_PHOTOS.length} photos — so job search isn’t only stress.`
            }
          />
        </div>

        <div className="mt-12">
          <h2 className="mb-4 text-xl font-extrabold text-joob-cocoa">
            {lang === "zh" ? "貓小隊精選" : "Cat crew highlights"}
          </h2>
          <CatGalleryStrip count={18} start={24} />
        </div>

        <div className="mt-12">
          <h2 className="mb-4 text-center text-xl font-extrabold text-joob-cocoa">
            {lang === "zh" ? "全部出鏡" : "Everyone is here"}
          </h2>
          <CatWall />
        </div>
      </div>
    </div>
  );
}
