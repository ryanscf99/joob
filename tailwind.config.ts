import type { Config } from "tailwindcss";

/**
 * jOOB palette — orange-forward to match the orange-and-white cat mascot.
 * Warm ginger, cream, and soft cocoa (not pink).
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Legacy macau.* aliases → orange cat theme
        macau: {
          red: "#F08A3C",
          green: "#5DBB8A",
          gold: "#F0C36A",
          navy: "#3D2C29",
          sky: "#FFF4E8",
          cream: "#FFF7EF",
          teal: "#7EB8A2",
        },
        joob: {
          cream: "#FFF7EF",
          peach: "#FFE0C2",
          /** Primary ginger orange (logo cat fur) */
          coral: "#F08A3C",
          /** Lighter ginger highlight */
          pink: "#FFB366",
          orange: "#F08A3C",
          orangeDeep: "#E06A1A",
          ginger: "#E8954A",
          mint: "#B8E6CF",
          mintDeep: "#5DBB8A",
          butter: "#FFEAA7",
          gold: "#F0C36A",
          cocoa: "#3D2C29",
          cocoaSoft: "#6B5344",
          lilac: "#F5E6D3",
          sky: "#FFF4E8",
          white: "#FFFFFF",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Noto Sans TC",
          "PingFang TC",
          "Microsoft JhengHei",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 8px 28px rgba(61, 44, 41, 0.10)",
        card: "0 3px 14px rgba(61, 44, 41, 0.07)",
        cat: "0 6px 22px rgba(240, 138, 60, 0.22)",
      },
      borderRadius: {
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
