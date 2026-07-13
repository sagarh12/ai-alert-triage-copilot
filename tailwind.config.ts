import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a0a",
        panel: "#111111",
        card: "#141414",
        primary: "#00ff88", // neon lime
        secondary: "#00e5ff", // cyan
        body: "#e0e0e0",
        muted: "#444444",
        // priority palette
        crit: "#ff3b3b",
        high: "#ff8c1a",
        med: "#ffd21a",
        low: "#00e5ff",
        info: "#7a7a7a",
      },
      fontFamily: {
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 20px #00ff8833",
        "neon-cyan": "0 0 20px #00e5ff33",
      },
      keyframes: {
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        pulseDot: "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
