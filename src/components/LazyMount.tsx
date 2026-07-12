"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

/**
 * Renders children only after the placeholder scrolls near the viewport.
 * Critical for tunnel/mobile: avoids downloading dozens of videos/images on first paint.
 */
export function LazyMount({
  children,
  className,
  minHeight = 120,
  rootMargin = "200px",
  placeholder,
}: {
  children: ReactNode;
  className?: string;
  minHeight?: number;
  rootMargin?: string;
  placeholder?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return (
    <div
      ref={ref}
      className={clsx(className)}
      style={!show ? { minHeight } : undefined}
    >
      {show
        ? children
        : placeholder || (
            <div className="flex h-full min-h-[120px] items-center justify-center rounded-2xl border border-joob-coral/10 bg-joob-peach/30 text-xs font-medium text-joob-cocoaSoft">
              …
            </div>
          )}
    </div>
  );
}
