import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/ibm-plex-mono/400.css";
import { Canvas } from "./canvas/Canvas";

// Global reset
const style = document.createElement("style");
style.textContent = `
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  html, body, #root {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: oklch(0.13 0 0);
  }
  body {
    font-family: 'IBM Plex Mono', monospace;
    -webkit-font-smoothing: antialiased;
  }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Canvas />
  </StrictMode>,
);
