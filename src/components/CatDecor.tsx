"use client";

import { useEffect, useRef, useState } from "react";
import {
  pickCat,
  pickCats,
  pickVideos,
  CAT_PHOTOS,
  CAT_VIDEOS,
  catSrc,
  videoSrc,
  FRONT_VIDEO,
  catTvPlaylist,
} from "@/lib/cat-gallery";
import clsx from "clsx";

/** Small floating paw / cat chip decoration */
export function PawDot({ className }: { className?: string }) {
  return (
    <span
      className={clsx("inline-block select-none", className)}
      aria-hidden
    >
      🐾
    </span>
  );
}

/** Circular cat face avatar (from gallery, stable by seed) */
export function CatAvatar({
  seed,
  size = 40,
  className,
  ring = true,
}: {
  seed: string | number;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 overflow-hidden rounded-full bg-joob-peach/40",
        ring && "ring-2 ring-joob-coral/40 ring-offset-2 ring-offset-joob-cream",
        className
      )}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pickCat(seed)}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </span>
  );
}

/** Masonry-ish photo strip for home / about */
export function CatGalleryStrip({
  count = 12,
  start = 0,
  className,
}: {
  count?: number;
  start?: number;
  className?: string;
}) {
  const photos = pickCats(count, start);
  return (
    <div
      className={clsx(
        "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6",
        className
      )}
    >
      {photos.map((src, i) => (
        <div
          key={src}
          className={clsx(
            "relative overflow-hidden rounded-2xl border-2 border-white shadow-cat bg-joob-peach/30",
            i % 5 === 0 ? "aspect-[3/4]" : "aspect-square",
            i % 7 === 0 && "rotate-1",
            i % 7 === 3 && "-rotate-1"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover transition duration-500 hover:scale-105"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

/** Full wall of (almost) every cat photo */
export function CatWall({
  className,
  limit,
}: {
  className?: string;
  /** Cap for very large galleries (default: all) */
  limit?: number;
}) {
  const files = limit ? CAT_PHOTOS.slice(0, limit) : CAT_PHOTOS;
  return (
    <div
      className={clsx(
        "columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-5",
        className
      )}
    >
      {files.map((file, i) => (
        <div
          key={file}
          className={clsx(
            "mb-3 break-inside-avoid overflow-hidden rounded-2xl border-2 border-white shadow-cat",
            i % 4 === 0 && "rotate-[0.5deg]",
            i % 4 === 2 && "-rotate-[0.5deg]"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={catSrc(file)}
            alt=""
            className="w-full object-cover"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}

/** Autoplay muted loop — only loads bytes when scrolled into view (tunnel-friendly) */
export function CatVideoTile({
  src,
  className,
  label,
}: {
  src: string;
  className?: string;
  label?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (typeof IntersectionObserver === "undefined") {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        setActive(hit);
        const el = ref.current;
        if (!el) return;
        if (hit) {
          el.muted = true;
          el.play().catch(() => undefined);
        } else {
          el.pause();
        }
      },
      { rootMargin: "80px", threshold: 0.15 }
    );
    io.observe(wrap);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    el.muted = true;
    el.playsInline = true;
    el.play().catch(() => undefined);
  }, [src, active]);

  return (
    <div
      ref={wrapRef}
      className={clsx("cat-video-tile aspect-[9/16] sm:aspect-video", className)}
    >
      {active ? (
        <video
          ref={ref}
          src={src}
          muted
          loop
          playsInline
          preload="none"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-joob-cocoa/80 text-xs text-white/60">
          ▶
        </div>
      )}
      {label && (
        <span className="absolute bottom-2 left-2 rounded-full bg-joob-cocoa/75 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {label}
        </span>
      )}
      <span className="absolute right-2 top-2 rounded-full bg-joob-coral px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
        ▶ live meow
      </span>
    </div>
  );
}

/** Grid of looping cat clips for the “meow lounge” (lazy per-tile) */
export function CatVideoLounge({
  count = 3,
  start = 0,
  className,
  title,
  subtitle,
}: {
  count?: number;
  start?: number;
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  const videos = pickVideos(
    Math.min(count, (CAT_VIDEOS as readonly string[]).length),
    start
  );
  if (!videos.length) return null;

  return (
    <div className={className}>
      {(title || subtitle) && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            {title && (
              <h2 className="text-xl font-extrabold text-joob-cocoa sm:text-2xl">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-joob-cocoaSoft">{subtitle}</p>
            )}
          </div>
          <span className="rounded-full bg-joob-peach px-3 py-1 text-xs font-bold text-joob-orangeDeep">
            {videos.length} clips · loads when visible
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {videos.map((src, i) => (
          <CatVideoTile
            key={src}
            src={src}
            label={`clip ${i + 1}`}
            className={i === 0 ? "md:col-span-1" : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** Hero mascot frame — uses pic/front_video.MP4 when useVideo is true */
export function MascotHero({
  src = "/brand/mascot-hero.jpg",
  className,
  useVideo,
  videoSrc: videoSrcProp,
}: {
  src?: string;
  className?: string;
  /** Prefer looping hero video (defaults to FRONT_VIDEO) */
  useVideo?: boolean;
  /** Override video URL (defaults to /videos/front_video.mp4) */
  videoSrc?: string;
}) {
  const video = useVideo ? videoSrcProp || FRONT_VIDEO : "";
  return (
    <div className={clsx("relative mx-auto w-full max-w-sm", className)}>
      <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-joob-coral/45 via-joob-peach/55 to-joob-mint/40 blur-sm" />
      <div className="relative overflow-hidden rounded-[1.75rem] border-4 border-white shadow-soft bg-joob-cream">
        {video ? (
          <video
            src={video}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
            poster="/brand/mascot-hero.jpg"
            className="aspect-[3/4] w-full object-cover object-center"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt="jOOB mascot cat"
            className="aspect-[3/4] w-full object-cover object-top"
          />
        )}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-joob-cocoa/70 to-transparent px-4 pb-4 pt-12">
          <p className="text-center text-sm font-bold text-white drop-shadow">
            jOOB · your job buddy 🐱
          </p>
        </div>
      </div>
      <span className="absolute -right-2 top-6 rounded-full bg-joob-coral px-3 py-1 text-xs font-bold text-white shadow-card rotate-6">
        hire meow!
      </span>
      <span className="absolute -left-3 bottom-16 rounded-full bg-joob-mint px-3 py-1 text-xs font-bold text-joob-cocoa shadow-card -rotate-6">
        🐾 purrfect match
      </span>
    </div>
  );
}

/** Decorative row of tiny cat bubbles for empty states / banners */
export function CatBubbleRow({
  seeds,
  size = 36,
}: {
  seeds: (string | number)[];
  size?: number;
}) {
  return (
    <div className="flex -space-x-2">
      {seeds.map((s, i) => (
        <CatAvatar key={String(s) + i} seed={s} size={size} />
      ))}
    </div>
  );
}

/**
 * Floating “Cat TV” break room — always-available entertainment for
 * young seekers who need a 30-second smile while job hunting.
 */
export function CatTV({ lang = "en" }: { lang?: "en" | "zh" }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Full playlist from public/videos (all pic/others clips + front)
  const playlist = catTvPlaylist().length
    ? catTvPlaylist()
    : (CAT_VIDEOS as readonly string[]).map((f) => videoSrc(f));
  // Include front_video at end so Cat TV has everything
  const fullList = (() => {
    const set = new Set(playlist);
    if (!set.has(FRONT_VIDEO)) set.add(FRONT_VIDEO);
    // Also ensure every file under CAT_VIDEOS is present
    for (const f of CAT_VIDEOS as readonly string[]) {
      set.add(videoSrc(f));
    }
    return [...set];
  })();

  const src = fullList.length ? fullList[idx % fullList.length] : "";

  useEffect(() => {
    if (!open || !src) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.load();
    el.play().catch(() => undefined);
  }, [open, src, idx]);

  // Gentle nudge after idle browsing (session once) — delayed so first paint stays light
  useEffect(() => {
    try {
      if (sessionStorage.getItem("joob_cat_tv_nudge")) return;
      // Slow links / tunnels: never auto-download a video on first open
      const slow =
        typeof navigator !== "undefined" &&
        // @ts-expect-error NetworkInformation not in all TS lib targets
        (navigator.connection?.saveData ||
          // @ts-expect-error effectiveType
          ["slow-2g", "2g", "3g"].includes(navigator.connection?.effectiveType));
      if (slow) return;
      const t = window.setTimeout(() => {
        sessionStorage.setItem("joob_cat_tv_nudge", "1");
        setOpen(true);
        setMinimized(true); // pill only — user expands to play
      }, 90000);
      return () => window.clearTimeout(t);
    } catch {
      /* private mode */
    }
  }, []);

  if (!fullList.length) return null;

  const zh = lang === "zh";

  return (
    <>
      {/* Launcher pill */}
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMinimized(false);
          }}
          className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full bg-joob-coral px-4 py-3 text-sm font-bold text-white shadow-cat transition hover:bg-joob-orangeDeep hover:scale-105"
          aria-label="Open Cat TV"
        >
          <span className="relative flex h-8 w-8 overflow-hidden rounded-full border-2 border-white/80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pickCat("tv-fab")}
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
          {zh ? "貓電視 · 休息一下" : "Cat TV · take a break"}
        </button>
      )}

      {open && (
        <div
          className={clsx(
            "fixed z-[90] overflow-hidden rounded-3xl border-2 border-white bg-joob-cocoa shadow-soft",
            minimized
              ? "bottom-5 right-5 h-14 w-48"
              : "bottom-5 right-5 w-[min(360px,calc(100vw-1.5rem))]"
          )}
        >
          <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-joob-orangeDeep to-joob-coral px-3 py-2">
            <span className="text-xs font-bold text-white">
              📺 {zh ? "jOOB 貓電視" : "jOOB Cat TV"}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white/90 hover:bg-white/15"
                onClick={() => setMinimized((m) => !m)}
              >
                {minimized ? "▣" : "—"}
              </button>
              <button
                type="button"
                className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white/90 hover:bg-white/15"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              <div className="relative aspect-video bg-black">
                <video
                  ref={videoRef}
                  key={src}
                  src={src}
                  muted
                  loop
                  playsInline
                  autoPlay
                  className="h-full w-full object-cover"
                />
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-joob-cocoa shadow-sm hover:bg-white"
                      onClick={() =>
                        setIdx(
                          (i) => (i - 1 + fullList.length) % fullList.length
                        )
                      }
                    >
                      {zh ? "← 上一隻" : "← Prev"}
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-joob-cocoa shadow-sm hover:bg-white"
                      onClick={() =>
                        setIdx((i) => (i + 1) % fullList.length)
                      }
                    >
                      {zh ? "下一隻 →" : "Next →"}
                    </button>
                  </div>
                  <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
                    {idx + 1}/{fullList.length} · muted
                  </span>
                </div>
              </div>
              <p className="bg-joob-cocoa px-3 py-2 text-[11px] leading-snug text-white/70">
                {zh
                  ? "求職累了？看 15 秒貓片再繼續申請。壓力↓ 動力↑"
                  : "Job hunt fatigue? 15 seconds of cat = lower stress, then apply again."}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
