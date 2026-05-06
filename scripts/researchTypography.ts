import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const GENERATED_TEXT_FONT =
  '"PP Neue Montreal Text", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const GENERATED_DISPLAY_FONT =
  '"PP Neue Montreal", "PP Neue Montreal Text", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export const GENERATED_FONT_FACE_CSS = `      @font-face {
        font-family: "PP Neue Montreal Text";
        src: url("fonts/PPNeueMontrealText-Light.woff2") format("woff2");
        font-weight: 300;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "PP Neue Montreal Text";
        src: url("fonts/PPNeueMontrealText-Book.woff2") format("woff2");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "PP Neue Montreal Text";
        src: url("fonts/PPNeueMontrealText-Bold.woff2") format("woff2");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "PP Neue Montreal";
        src: url("fonts/PPNeueMontreal-Extrabold.woff2") format("woff2");
        font-weight: 800;
        font-style: normal;
        font-display: swap;
      }`;

const FONT_FILES = [
  "PPNeueMontrealText-Light.woff2",
  "PPNeueMontrealText-Book.woff2",
  "PPNeueMontrealText-Bold.woff2",
  "PPNeueMontreal-Extrabold.woff2",
] as const;

export async function copyGeneratedFonts(outputDir: string): Promise<void> {
  const fontDir = path.join(outputDir, "fonts");
  await mkdir(fontDir, { recursive: true });
  await Promise.all(
    FONT_FILES.map((file) =>
      copyFile(path.resolve("public/fonts", file), path.join(fontDir, file)),
    ),
  );
}
