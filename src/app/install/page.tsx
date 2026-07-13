"use client";

import Link from "next/link";
import { Share, PlusSquare, Smartphone, CheckCircle2, ArrowLeft } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JOOB_LOGO_SM } from "@/lib/cat-gallery";

export default function InstallPage() {
  const { lang } = useApp();
  const zh = lang === "zh";

  const steps = zh
    ? [
        {
          n: "1",
          title: "用 Safari 打開 jOOB",
          body: "iPhone 上請使用 Safari（Chrome 等瀏覽器可能沒有「加入主畫面」）。",
        },
        {
          n: "2",
          title: "點底部中間的「分享」按鈕",
          body: "圖示是一個方框加向上箭頭。",
          icon: Share,
        },
        {
          n: "3",
          title: "向下滑，選「加入主畫面」",
          body: "可改名稱為 jOOB，然後點「加入」。",
          icon: PlusSquare,
        },
        {
          n: "4",
          title: "完成！從主畫面開啟",
          body: "會以全螢幕 App 模式啟動，更像原生 iPhone app。",
          icon: CheckCircle2,
        },
      ]
    : [
        {
          n: "1",
          title: "Open jOOB in Safari",
          body: "On iPhone, use Safari (other browsers often hide “Add to Home Screen”).",
        },
        {
          n: "2",
          title: "Tap the Share button",
          body: "The square with an upward arrow, usually at the bottom center.",
          icon: Share,
        },
        {
          n: "3",
          title: "Choose “Add to Home Screen”",
          body: "You can keep the name jOOB, then tap Add.",
          icon: PlusSquare,
        },
        {
          n: "4",
          title: "Launch from your Home Screen",
          body: "jOOB opens full-screen like a native iPhone app.",
          icon: CheckCircle2,
        },
      ];

  return (
    <div className="mx-auto max-w-lg px-4 py-10 pb-28 lg:pb-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-joob-cocoaSoft hover:text-joob-coral"
      >
        <ArrowLeft className="h-4 w-4" />
        {zh ? "返回首頁" : "Back home"}
      </Link>

      <div className="mt-6 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={JOOB_LOGO_SM}
          alt="jOOB"
          className="h-16 w-16 rounded-3xl border-2 border-joob-coral/30 object-cover shadow-cat"
        />
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-joob-peach px-2.5 py-0.5 text-[11px] font-bold text-joob-cocoa">
            <Smartphone className="h-3.5 w-3.5" />
            iPhone App
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-joob-cocoa">
            {zh ? "安裝 jOOB 到 iPhone" : "Install jOOB on iPhone"}
          </h1>
          <p className="mt-1 text-sm text-joob-cocoaSoft">
            {zh
              ? "免 App Store · 免費 · 全螢幕體驗"
              : "No App Store needed · free · full-screen"}
          </p>
        </div>
      </div>

      <ol className="mt-8 space-y-4">
        {steps.map((s) => {
          const Icon = s.icon;
          return (
            <li
              key={s.n}
              className="flex gap-3 rounded-3xl border border-joob-coral/15 bg-white/95 p-4 shadow-card"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-joob-coral text-sm font-extrabold text-white shadow-cat">
                {s.n}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-bold text-joob-cocoa">
                  {s.title}
                  {Icon && <Icon className="h-4 w-4 text-joob-coral" />}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-joob-cocoaSoft">
                  {s.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 rounded-3xl border border-joob-mintDeep/25 bg-joob-mint/20 p-4 text-sm text-joob-cocoa">
        <p className="font-semibold">
          {zh ? "小提示" : "Tip"}
        </p>
        <p className="mt-1 text-joob-cocoaSoft leading-relaxed">
          {zh
            ? "若看不到「加入主畫面」，請確認你用的是 Safari，並向下捲動分享選單。"
            : "If you don’t see “Add to Home Screen”, confirm you’re in Safari and scroll down the Share sheet."}
        </p>
      </div>

      <Link
        href="/jobs"
        className="joob-btn-primary mt-8 w-full"
      >
        {zh ? "開始找工作 🐱" : "Start browsing jobs 🐱"}
      </Link>
    </div>
  );
}
