/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        vision: {
          bg: "rgb(var(--vision-bg) / <alpha-value>)",
          panel: "rgb(var(--vision-panel) / <alpha-value>)",
          code: "rgb(var(--vision-code) / <alpha-value>)",
          border: "rgb(var(--vision-border) / <alpha-value>)",
          hover: "rgb(var(--vision-hover) / <alpha-value>)",
          text: "rgb(var(--vision-text) / <alpha-value>)",
          muted: "rgb(var(--vision-muted) / <alpha-value>)",
          accent: "#3ddc97",
          warn: "#f5a623",
          danger: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
