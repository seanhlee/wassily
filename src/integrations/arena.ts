import type { ReferenceImageSource, Size } from "../types";
import {
  compressReferenceImage,
  type CompressedReferenceImage,
} from "../images/compress";

const ARENA_API_ORIGIN = "https://api.are.na";
const DEFAULT_PREVIEW_LIMIT = 100;
const DEFAULT_IMPORT_CONCURRENCY = 6;

interface ArenaImageVersion {
  src?: string;
  width?: number;
  height?: number;
}

interface ArenaBlockImage {
  src?: string;
  width?: number;
  height?: number;
  small?: ArenaImageVersion;
  medium?: ArenaImageVersion;
  large?: ArenaImageVersion;
  square?: ArenaImageVersion;
}

interface ArenaBlockSource {
  url?: string | null;
}

interface ArenaBlock {
  id: number;
  type: string;
  title?: string | null;
  source?: ArenaBlockSource | null;
  image?: ArenaBlockImage | null;
}

export interface ArenaChannel {
  id?: number;
  title?: string;
  slug?: string;
}

interface ArenaContentsResponse {
  data?: ArenaBlock[];
  meta?: ArenaContentsMeta;
}

interface ArenaContentsMeta {
  current_page?: number;
  next_page?: number | null;
  per_page?: number;
  total_pages?: number;
  total_count?: number;
  has_more_pages?: boolean;
}

interface ArenaImportOptions {
  page?: number;
  per?: number;
  token?: string;
}

export interface ArenaImportedImage {
  blob: Blob;
  dataUrl: string;
  naturalSize: Size;
  source: ReferenceImageSource;
}

export interface ArenaImagePreview {
  id: number;
  title?: string;
  previewUrl: string;
  assetUrl: string;
  naturalSize: Size;
  source: Omit<ReferenceImageSource, "importedAt">;
}

export interface ArenaPreviewResult {
  channel: ArenaChannel;
  images: ArenaImagePreview[];
  pagination: ArenaPagination;
  skipped: number;
}

export interface ArenaPagination {
  currentPage: number;
  nextPage: number | null;
  perPage: number;
  totalPages: number;
  totalCount: number;
  hasMorePages: boolean;
}

export interface ArenaImportResult {
  channel: ArenaChannel;
  images: ArenaImportedImage[];
  skipped: number;
}

export interface ArenaImportImagesResult {
  images: ArenaImportedImage[];
  failed: number;
  failedIds: number[];
}

interface ImportArenaImagesOptions {
  concurrency?: number;
  compressor?: (blob: Blob) => Promise<CompressedReferenceImage>;
}

export function parseArenaChannelInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter an Are.na channel.");

  const withProtocol =
    trimmed.includes("are.na/") && !/^https?:\/\//i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;

  try {
    const url = new URL(withProtocol);
    if (url.hostname.endsWith("are.na")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const slug = parts.at(-1);
      if (slug) return slug;
    }
  } catch {
    // Plain slugs are expected.
  }

  return trimmed.replace(/^@/, "").replace(/\/+$/, "");
}

export function selectArenaImageAsset(
  image: ArenaBlockImage,
): { url: string; width: number; height: number } | null {
  const asset = image.large ?? image.medium ?? image.small ?? image.square;
  const url = asset?.src ?? image.src;
  if (!url) return null;

  return {
    url,
    width: asset?.width ?? image.width ?? 1,
    height: asset?.height ?? image.height ?? 1,
  };
}

export function selectArenaImagePreview(
  image: ArenaBlockImage,
): { url: string; width: number; height: number } | null {
  const asset = image.medium ?? image.small ?? image.large ?? image.square;
  const url = asset?.src ?? image.src;
  if (!url) return null;

  return {
    url,
    width: asset?.width ?? image.width ?? 1,
    height: asset?.height ?? image.height ?? 1,
  };
}

export async function previewArenaChannel(
  input: string,
  options: ArenaImportOptions = {},
): Promise<ArenaPreviewResult> {
  const channelId = parseArenaChannelInput(input);
  const per = Math.max(1, Math.min(options.per ?? DEFAULT_PREVIEW_LIMIT, 100));
  const page = Math.max(1, options.page ?? 1);
  const channel = await fetchArenaJson<ArenaChannel>(
    `/v3/channels/${encodeURIComponent(channelId)}`,
    options.token,
  );
  const contents = await fetchArenaJson<ArenaContentsResponse>(
    `/v3/channels/${encodeURIComponent(channelId)}/contents?per=${per}&page=${page}&sort=position_desc`,
    options.token,
  );
  const blocks = (contents.data ?? []).filter(
    (block) => block.type === "Image" && block.image,
  );
  const images = blocks
    .map((block) => previewArenaImage(block, channel))
    .filter((image): image is ArenaImagePreview => image !== null);

  return {
    channel,
    images,
    pagination: normalizeArenaPagination(contents.meta, page, per),
    skipped: blocks.length - images.length,
  };
}

export async function importArenaImages(
  previews: ArenaImagePreview[],
  options: ImportArenaImagesOptions = {},
): Promise<ArenaImportImagesResult> {
  const concurrency = Math.max(
    1,
    options.concurrency ?? DEFAULT_IMPORT_CONCURRENCY,
  );
  const compressor = options.compressor ?? compressReferenceImage;
  const attempts = await mapWithConcurrency(
    previews,
    concurrency,
    (preview) => importArenaPreview(preview, compressor),
  );
  const images = attempts.filter(
    (image): image is ArenaImportedImage => image !== null,
  );
  const failedIds = attempts.flatMap((image, index) =>
    image ? [] : [previews[index].id],
  );
  return { images, failed: failedIds.length, failedIds };
}

export async function importArenaChannel(
  input: string,
  options: ArenaImportOptions = {},
): Promise<ArenaImportResult> {
  const preview = await previewArenaChannel(input, options);
  const { images, failed } = await importArenaImages(preview.images);

  return {
    channel: preview.channel,
    images,
    skipped: preview.skipped + failed,
  };
}

async function mapWithConcurrency<T, U>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  if (items.length === 0) return [];
  const results: U[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchArenaJson<T>(path: string, token?: string): Promise<T> {
  const url = new URL(path, ARENA_API_ORIGIN);
  const headers: HeadersInit = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const response = await fetch(url, { headers });
  if (response.ok) return (await response.json()) as T;

  if (response.status === 401 || response.status === 403) {
    throw new Error("This Are.na channel needs authorization.");
  }
  if (response.status === 404) {
    throw new Error("Are.na channel not found.");
  }
  throw new Error("Are.na import failed.");
}

function previewArenaImage(
  block: ArenaBlock,
  channel: ArenaChannel,
): ArenaImagePreview | null {
  if (!block.image) return null;
  const asset = selectArenaImageAsset(block.image);
  const preview = selectArenaImagePreview(block.image);
  if (!asset || !preview) return null;

  return {
    id: block.id,
    title: block.title ?? undefined,
    previewUrl: preview.url,
    assetUrl: asset.url,
    naturalSize: { width: asset.width, height: asset.height },
    source: {
      provider: "arena",
      blockId: block.id,
      channelId: channel.id,
      channelSlug: channel.slug,
      channelTitle: channel.title,
      title: block.title ?? undefined,
      url: block.source?.url ?? undefined,
      assetUrl: asset.url,
    },
  };
}

function normalizeArenaPagination(
  meta: ArenaContentsMeta | undefined,
  page: number,
  per: number,
): ArenaPagination {
  const currentPage = meta?.current_page ?? page;
  const totalPages = meta?.total_pages ?? currentPage;
  const totalCount = meta?.total_count ?? 0;
  const nextPage = meta?.next_page ?? null;
  return {
    currentPage,
    nextPage,
    perPage: meta?.per_page ?? per,
    totalPages,
    totalCount,
    hasMorePages: meta?.has_more_pages ?? nextPage !== null,
  };
}

async function importArenaPreview(
  preview: ArenaImagePreview,
  compressor = compressReferenceImage,
): Promise<ArenaImportedImage | null> {
  try {
    const response = await fetch(preview.assetUrl, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const compressed = await compressor(blob);

    return {
      blob: compressed.blob,
      dataUrl: compressed.dataUrl,
      naturalSize: compressed.naturalSize,
      source: {
        ...preview.source,
        importedAt: Date.now(),
      },
    };
  } catch {
    return null;
  }
}
