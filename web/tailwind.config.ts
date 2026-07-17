import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "var(--base)",
        raise: "var(--raise)",
        sink: "var(--sink)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        indigo: "#5E6AD2",
        mint: "#2ED3A7",
        rose: "#FF5C6C",
      },
      fontFamily: {
        display: ["'Instrument Serif'", "Georgia", "serif"],
        sans: ["'Fira Sans'", "system-ui", "sans-serif"],
        mono: ["'Fira Code'", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: { ease: "cubic-bezier(0.16,1,0.3,1)" },
    },
  },
  plugins: [],
} satisfies Config;
