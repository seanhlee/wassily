import type { Size } from "../types";

export const REFERENCE_IMAGE_COMPRESSION_DEFAULTS = {
  maxBytes: 1_000_000,
  maxDimension: 1600,
  minDimension: 480,
  mimeTypes: ["image/webp", "image/jpeg"] as const,
  initialQuality: 0.76,
  minQuality: 0.48,
  qualityStep: 0.08,
  dimensionStep: 0.82,
};

export interface ImageCompressionOptions {
  maxBytes?: number;
  maxDimension?: number;
  minDimension?: number;
  mimeTypes?: readonly string[];
  initialQuality?: number;
  minQuality?: number;
  qualityStep?: number;
  dimensionStep?: number;
}

export interface ImageCompressionMetadata {
  compressed: boolean;
  originalBytes: number;
  compressedBytes: number;
  mimeType: string;
  width: number;
  height: number;
  quality?: number;
}

export interface CompressedReferenceImage {
  blob: Blob;
  dataUrl: string;
  naturalSize: Size;
  compression: ImageCompressionMetadata;
}

interface DecodedImage {
  image: CanvasImageSource;
  naturalSize: Size;
  dispose: () => void;
}

interface CompressionAttempt {
  blob: Blob;
  mimeType: string;
  quality: number;
  size: Size;
}

export function fitImageSize(size: Size, maxDimension: number): Size {
  const width = Math.max(1, Math.round(size.width));
  const height = Math.max(1, Math.round(size.height));
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };

  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function shouldCompressReferenceImage(
  blob: Pick<Blob, "size" | "type">,
  naturalSize: Size,
  options: ImageCompressionOptions = {},
): boolean {
  const resolved = resolveOptions(options);
  return (
    blob.size > resolved.maxBytes ||
    Math.max(naturalSize.width, naturalSize.height) > resolved.maxDimension ||
    !resolved.mimeTypes.includes(blob.type)
  );
}

export async function compressReferenceImage(
  blob: Blob,
  options: ImageCompressionOptions = {},
): Promise<CompressedReferenceImage> {
  const resolved = resolveOptions(options);
  const decoded = await decodeImageBlob(blob);
  if (!decoded) return passthroughReferenceImage(blob, resolved);

  try {
    const initialSize = fitImageSize(decoded.naturalSize, resolved.maxDimension);
    const best = await compressDecodedImage(decoded.image, initialSize, resolved);
    if (!best) return passthroughReferenceImage(blob, resolved, decoded.naturalSize);

    const shouldUseCompressed =
      best.blob.size < blob.size ||
      Math.max(decoded.naturalSize.width, decoded.naturalSize.height) >
        resolved.maxDimension ||
      blob.size > resolved.maxBytes;
    const output = shouldUseCompressed
      ? best
      : {
          blob,
          mimeType: blob.type || "application/octet-stream",
          quality: resolved.initialQuality,
          size: decoded.naturalSize,
        };

    return {
      blob: output.blob,
      dataUrl: await blobToDataUrl(output.blob),
      naturalSize: output.size,
      compression: {
        compressed: output.blob !== blob,
        originalBytes: blob.size,
        compressedBytes: output.blob.size,
        mimeType: output.blob.type || output.mimeType,
        width: output.size.width,
        height: output.size.height,
        ...(output.blob !== blob ? { quality: output.quality } : {}),
      },
    };
  } finally {
    decoded.dispose();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      reject(new Error("FileReader is unavailable."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function resolveOptions(options: ImageCompressionOptions) {
  return {
    ...REFERENCE_IMAGE_COMPRESSION_DEFAULTS,
    ...options,
    mimeTypes:
      options.mimeTypes && options.mimeTypes.length > 0
        ? options.mimeTypes
        : REFERENCE_IMAGE_COMPRESSION_DEFAULTS.mimeTypes,
  };
}

async function compressDecodedImage(
  image: CanvasImageSource,
  initialSize: Size,
  options: Required<Omit<ImageCompressionOptions, "mimeTypes">> & {
    mimeTypes: readonly string[];
  },
): Promise<CompressionAttempt | null> {
  let size = initialSize;
  let best: CompressionAttempt | null = null;

  while (true) {
    for (const mimeType of options.mimeTypes) {
      const candidate = await compressAtSize(image, size, mimeType, options);
      if (!candidate) continue;
      if (!best || candidate.blob.size < best.blob.size) best = candidate;
      if (candidate.blob.size <= options.maxBytes) return candidate;
    }

    const longest = Math.max(size.width, size.height);
    if (longest <= options.minDimension) return best;
    const scale = Math.max(options.minDimension / longest, options.dimensionStep);
    size = {
      width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)),
    };
  }
}

async function compressAtSize(
  image: CanvasImageSource,
  size: Size,
  mimeType: string,
  options: Required<Omit<ImageCompressionOptions, "mimeTypes">> & {
    mimeTypes: readonly string[];
  },
): Promise<CompressionAttempt | null> {
  let quality = options.initialQuality;
  let best: CompressionAttempt | null = null;

  while (quality >= options.minQuality - 0.001) {
    const blob = await renderToBlob(image, size, mimeType, quality);
    if (blob) {
      const attempt = { blob, mimeType, quality, size };
      if (!best || blob.size < best.blob.size) best = attempt;
      if (blob.size <= options.maxBytes) return attempt;
    }
    quality -= options.qualityStep;
  }

  return best;
}

async function renderToBlob(
  image: CanvasImageSource,
  size: Size,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (mimeType === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size.width, size.height);
  }
  ctx.drawImage(image, 0, 0, size.width, size.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function decodeImageBlob(blob: Blob): Promise<DecodedImage | null> {
  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    typeof Image === "undefined"
  ) {
    return null;
  }

  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to decode image."));
      image.src = url;
    });
    return {
      image,
      naturalSize: {
        width: image.naturalWidth || image.width || 1,
        height: image.naturalHeight || image.height || 1,
      },
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function passthroughReferenceImage(
  blob: Blob,
  options: ReturnType<typeof resolveOptions>,
  naturalSize: Size = { width: 1, height: 1 },
): Promise<CompressedReferenceImage> {
  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    naturalSize,
    compression: {
      compressed: false,
      originalBytes: blob.size,
      compressedBytes: blob.size,
      mimeType: blob.type || "application/octet-stream",
      width: naturalSize.width,
      height: naturalSize.height,
      quality: options.initialQuality,
    },
  };
}
