"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { JOOB_LOGO_SM } from "@/lib/cat-gallery";
import clsx from "clsx";

const DISMISS_KEY = "joob_install_banner_dismissed_v1";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  );
}

/**
 * Friendly prompt: install jOOB as an iPhone Home Screen app (PWA).
 * Shows iOS Share instructions; on Android may use beforeinstallprompt.
 */
export function InstallAppBanner() {
  const { lang } = useApp();
  const zh = lang === "zh";
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<{
    prompt: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    setIos(isIos());

    // Delay so first paint stays calm
    const t = window.setTimeout(() => setVisible(true), 1800);

    const onBip = (e: Event) => {
      e.preventDefault();
      const ev = e as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      };
      setDeferred({
        prompt: async () => {
          await ev.prompt();
          await ev.userChoice;
        },
      });
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBip);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!visible) return null;

  return (
    <div
      className={clsx(
        "fixed inset-x-0 z-[60] px-3",
        "bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4"
      )}
      role="dialog"
      aria-label={zh ? "安裝 jOOB App" : "Install jOOB app"}
    >
      <div className="mx-auto flex max-w-lg items-start gap-3 rounded-3xl border border-joob-coral/25 bg-white/95 p-3.5 shadow-cat backdrop-blur-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={JOOB_LOGO_SM}
          alt=""
          className="h-12 w-12 shrink-0 rounded-2xl border-2 border-joob-coral/30 object-cover"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-joob-cocoa">
            {zh ? "把 jOOB 加到 iPhone 主畫面" : "Add jOOB to your iPhone"}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-joob-cocoaSoft">
            {ios
              ? zh
                ? "在 Safari 點分享按鈕 →「加入主畫面」，就能像 App 一樣全螢幕使用。"
                : "In Safari, tap Share → “Add to Home Screen” for a full-screen app experience."
              : zh
                ? "安裝到主畫面，更快開啟職位與智能配對。"
                : "Install to your home screen for faster jobs & smart match."}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {deferred && (
              <button
                type="button"
                onClick={() => void deferred.prompt().then(dismiss)}
                className="inline-flex items-center gap-1.5 rounded-full bg-joob-coral px-3 py-1.5 text-xs font-bold text-white shadow-cat"
              >
                <Download className="h-3.5 w-3.5" />
                {zh ? "安裝" : "Install"}
              </button>
            )}
            {ios && (
              <span className="inline-flex items-center gap-1 rounded-full bg-joob-peach px-2.5 py-1 text-[11px] font-semibold text-joob-cocoa">
                <Share className="h-3 w-3" />
                {zh ? "分享 → 加入主畫面" : "Share → Add to Home Screen"}
              </span>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-joob-cocoaSoft hover:bg-joob-sky"
            >
              {zh ? "稍後" : "Later"}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full p-1.5 text-joob-cocoaSoft hover:bg-joob-peach"
          aria-label={zh ? "關閉" : "Dismiss"}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
