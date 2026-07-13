import type { MetadataRoute } from "next";

/** Web App Manifest — enables installable jOOB on iPhone (Home Screen) & Android. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "jOOB · Macau youth job buddy",
    short_name: "jOOB",
    description:
      "jOOB (Jobs Out Of the Blue) — Macau youth jobs: DSAL, Jobscall, Hello-Jobs, smart match, local hiring signals.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#FFF7EF",
    theme_color: "#F08A3C",
    lang: "en",
    categories: ["business", "education", "productivity"],
    icons: [
      {
        src: "/brand/joob-logo-256.png",
        sizes: "256x256",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/joob-logo-256.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/joob-logo-256.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
