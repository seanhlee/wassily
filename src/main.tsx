import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "./canvas/Canvas";
import { FONT } from "./constants";

// Global reset
const style = document.createElement("style");
const fontBaseUrl = `${import.meta.env.BASE_URL}fonts/`;
style.textContent = `
  @font-face {
    font-family: "PP Neue Montreal";
    src: url("${fontBaseUrl}PPNeueMontreal-Regular.woff2") format("woff2");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: "PP Neue Montreal";
    src: url("${fontBaseUrl}PPNeueMontreal-Medium.woff2") format("woff2");
    font-weight: 500;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: "PP Neue Montreal";
    src: url("${fontBaseUrl}PPNeueMontreal-Semibold.woff2") format("woff2");
    font-weight: 600;
    font-style: normal;
    font-display: swap;
  }
  @font-face {
    font-family: "PP Neue Montreal";
    src: url("${fontBaseUrl}PPNeueMontreal-Extrabold.woff2") format("woff2");
    font-weight: 800;
    font-style: normal;
    font-display: swap;
  }
  *, *::before, *::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  html, body, #root {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
  }
  body {
    font-family: ${FONT};
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }
`;
document.head.appendChild(style);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Canvas />
  </StrictMode>,
);
