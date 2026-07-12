"use client";

import { useApp } from "@/context/AppContext";
import { CatTV } from "@/components/CatDecor";

/** Mounts floating Cat TV with current language */
export function CatTVHost() {
  const { lang } = useApp();
  return <CatTV lang={lang} />;
}
