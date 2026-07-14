"use client";

import { useEffect } from "react";
import { useApp } from "@/context/AppContext";

export function DocumentLanguage() {
  const { lang } = useApp();
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-Hant-MO" : "en";
  }, [lang]);
  return null;
}
