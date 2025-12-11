import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        // Fantasy dungeon palette for LLMings
        "llm-bg": "#050714",
        "llm-panel": "#0b1224",
        "llm-panel-soft": "#121a30",
        "llm-border": "#2e3a5b",
        "llm-accent": "#ffdf6b",
        "llm-accent-strong": "#ff9f4a",
        "llm-accent-alt": "#76e4ff",
        "llm-danger": "#ff4b6b",
        "llm-text": "#f7f5ff",
        "llm-muted": "#b5bedc",
      },
      boxShadow: {
        "llm-card": "0 16px 40px rgba(0,0,0,0.7)",
        "llm-glow": "0 0 30px rgba(118,228,255,0.55)",
      },
      backgroundImage: {
        "llm-radial":
          "radial-gradient(circle at top, rgba(255,223,107,0.18), transparent 60%), radial-gradient(circle at bottom, rgba(118,228,255,0.18), transparent 55%)",
        "llm-log":
          "linear-gradient(to bottom, rgba(9,13,30,0.96), rgba(3,6,20,0.98))",
      },
    },
  },
  plugins: [],
};

export default config;


