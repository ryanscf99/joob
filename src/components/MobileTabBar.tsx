"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Briefcase,
  Sparkles,
  UserCircle2,
  LayoutDashboard,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import clsx from "clsx";

const tabs = [
  { href: "/", key: "navHome" as const, icon: Home, labelEn: "Home", labelZh: "首頁" },
  { href: "/jobs", key: "navJobs" as const, icon: Briefcase, labelEn: "Jobs", labelZh: "職位" },
  { href: "/match", key: "navMatch" as const, icon: Sparkles, labelEn: "Match", labelZh: "配對" },
  { href: "/youth", key: "navYouth" as const, icon: UserCircle2, labelEn: "Profile", labelZh: "檔案" },
  {
    href: "/dashboard",
    key: "navDashboard" as const,
    icon: LayoutDashboard,
    labelEn: "Data",
    labelZh: "數據",
  },
];

/**
 * iOS-style bottom tab bar — primary navigation on phones.
 * Hidden on large screens (desktop uses top nav).
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { lang, tr } = useApp();
  const zh = lang === "zh";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-joob-coral/20 bg-white/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label={zh ? "主要導覽" : "Primary navigation"}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 pt-1">
        {tabs.map((t) => {
          const active =
            t.href === "/"
              ? pathname === "/"
              : pathname === t.href || pathname.startsWith(`${t.href}/`);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={clsx(
                "flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-semibold transition active:scale-95",
                active
                  ? "text-joob-coral"
                  : "text-joob-cocoaSoft hover:text-joob-cocoa"
              )}
            >
              <span
                className={clsx(
                  "flex h-8 w-8 items-center justify-center rounded-2xl transition",
                  active ? "bg-joob-peach shadow-cat" : "bg-transparent"
                )}
              >
                <Icon
                  className={clsx("h-5 w-5", active && "stroke-[2.5px]")}
                  aria-hidden
                />
              </span>
              <span className="truncate max-w-full">
                {zh ? t.labelZh : tr(t.key)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
