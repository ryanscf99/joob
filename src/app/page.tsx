"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Shield,
  Sparkles,
  Users,
  Briefcase,
  Database,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JobCard } from "@/components/JobCard";
import { keyFacts } from "@/lib/open-data";
import {
  CatGalleryStrip,
  CatWall,
  MascotHero,
  PawDot,
  CatAvatar,
  CatVideoLounge,
} from "@/components/CatDecor";
import { LazyMount } from "@/components/LazyMount";
import { pickCat, CAT_PHOTOS, CAT_VIDEOS } from "@/lib/cat-gallery";

export default function HomePage() {
  const { tr, jobs, lang } = useApp();
  const featured = jobs.slice(0, 3);

  return (
    <div className="paw-bg">
      {/* Hero */}
      <section className="hero-grid border-b border-joob-coral/10">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12 md:py-16">
          <div className="grid items-center gap-8 sm:gap-10 lg:grid-cols-2">
            <div>
              <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-joob-coral/20 bg-white/90 px-3 py-1.5 text-xs font-semibold text-joob-cocoaSoft shadow-sm">
                <Database className="h-3.5 w-3.5 shrink-0 text-joob-coral" />
                <span className="truncate">data.gov.mo · DSEC · DSAL</span>
                <PawDot />
              </div>
              <h1 className="mt-4 sm:mt-5 max-w-xl text-3xl font-extrabold tracking-tight text-joob-cocoa text-balance sm:text-4xl md:text-5xl">
                {tr("heroTitle")}
              </h1>
              <p className="mt-3 sm:mt-4 max-w-xl text-base sm:text-lg leading-relaxed text-joob-cocoaSoft">
                {tr("heroSub")}
              </p>
              <div className="mt-6 sm:mt-8 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-3">
                <Link href="/jobs" className="joob-btn-primary w-full sm:w-auto">
                  {tr("ctaFindJobs")} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/match" className="joob-btn-secondary w-full sm:w-auto">
                  {tr("ctaMatch")} 🐱
                </Link>
                <div className="flex gap-2.5">
                  <Link href="/faculty" className="joob-btn-ghost flex-1 sm:flex-none">
                    {lang === "zh" ? "高校教職" : "Faculty"}
                  </Link>
                  <Link href="/install" className="joob-btn-ghost flex-1 sm:flex-none">
                    {lang === "zh" ? "iPhone App" : "iPhone App"}
                  </Link>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    label: tr("statsYouthUE"),
                    value: `${keyFacts.youthUnemployment}%`,
                  },
                  {
                    label: tr("statsGeneralUE"),
                    value: `${keyFacts.generalUnemployment}%`,
                  },
                  {
                    label: tr("statsDsal"),
                    value: keyFacts.dsalMatchesH1.toLocaleString(),
                  },
                  {
                    label: tr("statsDays"),
                    value: `~${keyFacts.daysToJobUnder25}`,
                  },
                ].map((s, i) => (
                  <div
                    key={s.label}
                    className="joob-card relative overflow-hidden p-4"
                  >
                    <CatAvatar
                      seed={`stat-${i}`}
                      size={28}
                      className="absolute right-2 top-2 opacity-90"
                    />
                    <div className="text-2xl font-extrabold text-joob-coral">
                      {s.value}
                    </div>
                    <div className="mt-1 pr-8 text-xs leading-snug text-joob-cocoaSoft">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <MascotHero useVideo videoSrc="/videos/front_video.mp4" />
          </div>
        </div>
      </section>

      {/* Cat photo strip */}
      <section className="border-b border-joob-coral/10 bg-white/60 py-6">
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-joob-cocoa">
              {lang === "zh"
                ? "jOOB 貓小隊 · 為你打氣"
                : "jOOB cat crew · cheering you on"}
            </h2>
            <span className="text-xs text-joob-cocoaSoft">
              {lang === "zh"
                ? `${CAT_PHOTOS.length} 張照片 · ${CAT_VIDEOS.length} 支影片 🐾`
                : `${CAT_PHOTOS.length} photos · ${CAT_VIDEOS.length} clips 🐾`}
            </span>
          </div>
          {/* Fewer images on first paint — rest of gallery is below fold */}
          <CatGalleryStrip count={8} start={0} />
        </div>
      </section>

      {/* Meow lounge — only mounts when scrolled near (tunnel-friendly) */}
      <section className="border-b border-joob-coral/10 bg-gradient-to-b from-joob-peach/50 to-joob-cream py-12">
        <div className="mx-auto max-w-6xl px-4">
          <LazyMount minHeight={280} rootMargin="120px">
            <CatVideoLounge
              count={3}
              start={0}
              title={
                lang === "zh"
                  ? "喵休息室 · 求職中途充電"
                  : "Meow lounge · recharge mid-hunt"
              }
              subtitle={
                lang === "zh"
                  ? "捲到這裡才載入影片。右下角「貓電視」可隨時播放更多。"
                  : "Clips load only when you scroll here. Use Cat TV (bottom-right) for more anytime."
              }
            />
          </LazyMount>
          <p className="mt-4 text-center text-xs text-joob-cocoaSoft">
            {lang === "zh"
              ? "小貼士：右下角「貓電視」隨時可開，換下一批貓。"
              : "Tip: open Cat TV (bottom-right) anytime to shuffle more clips."}
          </p>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-extrabold text-joob-cocoa">
          {tr("problemTitle")}
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Users,
              text: tr("problemYouth"),
              seed: "p1",
              tint: "from-joob-coral/10 to-joob-peach/40",
            },
            {
              icon: Briefcase,
              text: tr("problemEmployer"),
              seed: "p2",
              tint: "from-joob-butter/40 to-joob-peach/30",
            },
            {
              icon: BarChart3,
              text: tr("problemData"),
              seed: "p3",
              tint: "from-joob-mint/40 to-joob-sky",
            },
          ].map((c) => (
            <div
              key={c.text}
              className={`joob-card relative overflow-hidden bg-gradient-to-br ${c.tint} p-5`}
            >
              <div className="flex items-start justify-between gap-3">
                <c.icon className="h-6 w-6 text-joob-coral" />
                <CatAvatar seed={c.seed} size={48} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-joob-cocoaSoft">
                {c.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-joob-coral/10 bg-white/70">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-extrabold text-joob-cocoa">
            {tr("howItWorks")}
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", t: tr("step1"), d: tr("step1d"), icon: Sparkles },
              { n: "02", t: tr("step2"), d: tr("step2d"), icon: BarChart3 },
              { n: "03", t: tr("step3"), d: tr("step3d"), icon: Users },
              { n: "04", t: tr("step4"), d: tr("step4d"), icon: Shield },
            ].map((s, i) => (
              <div key={s.n} className="joob-card relative p-5">
                <div
                  className="absolute inset-x-0 top-0 h-1.5 rounded-t-3xl"
                  style={{
                    background: `url(${pickCat(`step-${i}`)}) center/cover`,
                  }}
                />
                <div className="mt-2 text-xs font-bold tracking-widest text-joob-gold">
                  {s.n}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-joob-coral" />
                  <h3 className="font-semibold text-joob-cocoa">{s.t}</h3>
                </div>
                <p className="mt-2 text-sm text-joob-cocoaSoft leading-relaxed">
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured jobs */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <CatAvatar seed="featured" size={44} />
            <h2 className="text-2xl font-extrabold text-joob-cocoa">
              {tr("featuredJobs")}
            </h2>
          </div>
          <Link
            href="/jobs"
            className="text-sm font-bold text-joob-coral hover:underline inline-flex items-center gap-1"
          >
            {tr("viewAll")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {featured.map((job) => (
            <JobCard key={job.id} job={job} compact />
          ))}
        </div>
      </section>

      {/* CTAs */}
      <section className="mx-auto max-w-6xl px-4 pb-10">
        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/youth"
            className="card-glow relative overflow-hidden rounded-3xl bg-gradient-to-br from-joob-coral to-joob-pink p-8 text-white transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pickCat("cta-youth")}
              alt=""
              className="absolute right-0 top-0 h-full w-2/5 object-cover opacity-35"
            />
            <div className="relative">
              <div className="text-sm font-medium text-white/80">
                {tr("forYouth")}
              </div>
              <div className="mt-2 text-2xl font-extrabold">
                {tr("youthPortal")}
              </div>
              <p className="mt-2 max-w-sm text-sm text-white/80">
                {lang === "zh"
                  ? "建立檔案、上傳履歷、記錄家長同意，並申請職位。"
                  : "Build your profile, upload a CV, record parental consent if needed, and apply."}
              </p>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-bold">
                {tr("ctaBuildProfile")} <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
          <Link
            href="/dashboard"
            className="card-glow relative overflow-hidden joob-card p-8 transition"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pickCat("cta-dash")}
              alt=""
              className="absolute right-0 bottom-0 h-28 w-28 rounded-tl-3xl object-cover opacity-80"
            />
            <div className="relative max-w-[70%]">
              <div className="text-sm font-medium text-joob-cocoaSoft">
                {lang === "zh" ? "市場真相" : "Market truth"}
              </div>
              <div className="mt-2 text-2xl font-extrabold text-joob-cocoa">
                {tr("workforceMacroTitle")}
              </div>
              <p className="mt-2 text-sm text-joob-cocoaSoft">
                {lang === "zh"
                  ? "查看本地 vs 外地僱員結構、行業薪酬與失業率訊號。"
                  : "See local vs non-resident labour mix, sector pay, and unemployment signals."}
              </p>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-joob-coral">
                {tr("ctaExploreMarket")} <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* Heavy media only after scroll — critical for Option C (tunnel) */}
      <section className="border-t border-joob-coral/10 bg-gradient-to-b from-joob-peach/40 to-joob-cream py-14">
        <div className="mx-auto max-w-6xl px-4">
          <LazyMount minHeight={320} rootMargin="160px" className="mb-12">
            <CatVideoLounge
              count={3}
              start={3}
              title={
                lang === "zh" ? "更多現場貓片" : "More live cat energy"
              }
              subtitle={
                lang === "zh"
                  ? "瀏覽職位太久？先笑一下再回來。"
                  : "Scrolling listings for too long? Smile first, then continue."
              }
            />
          </LazyMount>
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-extrabold text-joob-cocoa">
              {lang === "zh" ? "jOOB 全家福" : "The whole jOOB family"}
            </h2>
            <p className="mt-2 text-sm text-joob-cocoaSoft">
              {lang === "zh"
                ? `共 ${CAT_PHOTOS.length} 張照片（捲動後載入，避免開站過慢）。`
                : `${CAT_PHOTOS.length} photos (load as you scroll — keeps first open fast).`}
            </p>
          </div>
          <LazyMount minHeight={400} rootMargin="200px">
            <CatWall limit={36} />
          </LazyMount>
        </div>
      </section>
    </div>
  );
}
