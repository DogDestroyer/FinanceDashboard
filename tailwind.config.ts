import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0D1321",      // app background: deep desk-blue, not black
        panel: "#151C2E",    // cards
        edge: "#232D45",     // hairlines
        fog: "#8A94AC",      // secondary text
        paper: "#E9EDF5",    // primary text
        gain: "#3FB68B",
        loss: "#E0596B",
        brass: "#D9A441"     // single accent: brass, used sparingly
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        sans: ["'Archivo'", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
