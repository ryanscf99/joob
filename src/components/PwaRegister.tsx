"use client";

import { useEffect } from "react";

/** Registers the service worker for installable / offline-capable PWA. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Avoid SW on localhost if it interferes with HMR — still useful for testing PWA
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* silent — private mode / unsupported */
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
