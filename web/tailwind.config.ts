import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        deep: "#020203",
        base: "#050506",
        elevated: "#0a0a0c",
        fg: "#EDEDEF",
        muted: "#8A8F98",
        faint: "#4A4F58",
        accent: "#5E6AD2",
        bid: "#2ED3A7",
        ask: "#FF5C6C",
      },
      borderRadius: { xl: "16px", "2xl": "20px" },
      fontFamily: {
        sans: ["'Fira Sans'", "system-ui", "sans-serif"],
        mono: ["'Fira Code'", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: { ease: "cubic-bezier(0.16,1,0.3,1)" },
    },
  },
  plugins: [],
} satisfies Config;
