import type {
  CloudAction,
  CloudBoardSettings,
  CloudCanvasObject,
  CloudObjectFieldPatch,
  CloudObjectPatch,
  CloudNormalizeResult,
  CloudPersistedCanvasObject,
  CloudReferenceImage,
  CloudTouchedField,
  CloudUnsetField,
} from "./types";
import { CLOUD_SCHEMA_VERSION, isCloudReferenceImage } from "./types";
import type {
  Connection,
  ExtractionMarker,
  Note,
  OklchColor,
  Ramp,
  RampConfig,
  Swatch,
} from "../types";
import { NEUTRAL_CHROMA, clampToGamut, maxChroma } from "../engine/gamut";
import { purifyColor } from "../engine/purify";
import { solveRamp, uniqueRampName } from "../engine/ramp";

export interface NormalizeCloudActionInput {
  objects: Record<string, CloudCanvasObject>;
  action: CloudAction;
  settings?: CloudBoardSettings;
  now?: number;
}

const VALID_RAMP_STOP_COUNTS = new Set([3, 5, 7, 9, 11, 13]);
const VALID_CLOUD_OBJECT_TYPES = new Set<CloudCanvasObject["type"]>([
  "swatch",
  "ramp",
  "connection",
  "reference-image",
  "note",
]);
const MAX_POSITION_MAGNITUDE = 1_000_000;
const MAX_IMAGE_EDGE = 16_384;
const MAX_NOTE_LENGTH = 10_000;
const MAX_CONNECTION_ENDPOINTS_PER_ACTION = 32;
const MAX_EXTRACTION_SAMPLES_PER_ACTION = 24;

function createObject(
  object: CloudCanvasObject,
  touchedFields: CloudTouchedField[],
): CloudObjectPatch {
  return {
    kind: "create",
    objectId: object.id,
    object,
    touchedFields,
  };
}

function replaceObject(
  object: CloudCanvasObject,
  touchedFields: CloudTouchedField[],
): CloudObjectPatch {
  return {
    kind: "replace",
    objectId: object.id,
    object,
    touchedFields,
  };
}

function updateObject(
  objectId: string,
  type: CloudCanvasObject["type"],
  patch: CloudObjectFieldPatch,
  touchedFields: CloudTouchedField[],
  unsetFields?: CloudUnsetField[],
): CloudObjectPatch {
  return {
    kind: "update",
    objectId,
    type,
    patch,
    touchedFields,
    ...(unsetFields && unsetFields.length > 0 ? { unsetFields } : {}),
  };
}

function noChange(): CloudNormalizeResult {
  return { patches: [], deletes: [] };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFinitePosition(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const point = value as { x?: unknown; y?: unknown };
  return (
    isFiniteNumber(point.x) &&
    isFiniteNumber(point.y) &&
    Math.abs(point.x) <= MAX_POSITION_MAGNITUDE &&
    Math.abs(point.y) <= MAX_POSITION_MAGNITUDE
  );
}

function isUnitPoint(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const point = value as { x?: unknown; y?: unknown };
  return (
    isFiniteNumber(point.x) &&
    isFiniteNumber(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}

function isValidColor(value: unknown): value is OklchColor {
  if (!value || typeof value !== "object") return false;
  const color = value as Partial<OklchColor>;
  return (
    isFiniteNumber(color.l) &&
    isFiniteNumber(color.c) &&
    isFiniteNumber(color.h) &&
    color.l >= 0 &&
    color.l <= 1 &&
    color.c >= 0 &&
    color.c <= 0.5 &&
    color.h >= 0 &&
    color.h <= 360
  );
}

function isValidSize(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const size = value as { width?: unknown; height?: unknown };
  return (
    isFiniteNumber(size.width) &&
    isFiniteNumber(size.height) &&
    size.width > 0 &&
    size.height > 0 &&
    size.width <= MAX_IMAGE_EDGE &&
    size.height <= MAX_IMAGE_EDGE
  );
}

function isValidTimestamp(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isValidStopCount(stopCount: unknown): stopCount is number {
  return typeof stopCount === "number" && VALID_RAMP_STOP_COUNTS.has(stopCount);
}

function purifyForCloudSwatch(color: OklchColor): OklchColor {
  return color.c < NEUTRAL_CHROMA ? color : purifyColor(color);
}

function clearMarkersBySwatchIds(
  objects: Record<string, CloudCanvasObject>,
  swatchIds: Set<string>,
  updatedAt: number,
): CloudObjectPatch[] {
  if (swatchIds.size === 0) return [];

  const patches: CloudObjectPatch[] = [];
  for (const object of Object.values(objects)) {
    if (!isCloudReferenceImage(object) || !object.extraction) continue;
    const markers = object.extraction.markers.filter(
      (marker) => !swatchIds.has(marker.swatchId),
    );
    if (markers.length === object.extraction.markers.length) continue;

    patches.push(
      markers.length === 0
        ? updateObject(
            object.id,
            "reference-image",
            {},
            ["extraction"],
            ["extraction"],
          )
        : updateObject(
            object.id,
            "reference-image",
            {
              extraction: {
                ...object.extraction,
                markers,
                updatedAt,
              },
            },
            ["extraction"],
          ),
    );
  }
  return patches;
}

function normalizeRampConfig(
  ramp: Ramp,
  overrides: Partial<RampConfig> = {},
): RampConfig {
  return {
    hue: ramp.seedHue,
    stopCount: ramp.stopCount,
    mode: ramp.mode,
    seedChroma: ramp.seedChroma,
    seedLightness: ramp.seedLightness,
    targetGamut: ramp.targetGamut,
    ...overrides,
  };
}

function existingRampNames(
  objects: Record<string, CloudCanvasObject>,
  excludingId?: string,
): string[] {
  return Object.values(objects)
    .filter((object): object is Ramp =>
      object.type === "ramp" && object.id !== excludingId,
    )
    .map((ramp) => ramp.name);
}

function neutralRampName(
  color: OklchColor,
  objects: Record<string, CloudCanvasObject>,
): string {
  const hue = color.h;
  const warmish = (hue >= 20 && hue <= 80) || hue >= 340 || hue <= 20;
  const coolish = hue >= 200 && hue <= 280;
  const baseName = warmish ? "warm-gray" : coolish ? "cool-gray" : "gray";
  const names = existingRampNames(objects);
  if (!names.includes(baseName)) return baseName;
  let index = 2;
  while (names.includes(`${baseName}-${index}`)) index++;
  return `${baseName}-${index}`;
}

function solveRampFields(config: RampConfig): Pick<
  Ramp,
  "fallbackStops" | "solveMetadata" | "stops" | "targetGamut"
> {
  const solved = solveRamp(config);
  return {
    stops: solved.stops,
    ...(solved.fallbackStops === undefined
      ? {}
      : { fallbackStops: solved.fallbackStops }),
    solveMetadata: solved.metadata,
    targetGamut: solved.metadata.targetGamut,
  };
}

function promoteSwatchToRamp(
  swatch: Swatch,
  objects: Record<string, CloudCanvasObject>,
  stopCount: number,
): Ramp {
  const solved = solveRampFields({
    hue: swatch.color.h,
    stopCount,
    mode: "opinionated",
    seedChroma: swatch.color.c,
    seedLightness: swatch.color.l,
  });
  const name =
    swatch.color.c < NEUTRAL_CHROMA
      ? neutralRampName(swatch.color, objects)
      : uniqueRampName(swatch.color.h, existingRampNames(objects, swatch.id));

  return {
    id: swatch.id,
    type: "ramp",
    seedHue: swatch.color.h,
    ...solved,
    stopCount,
    position: swatch.position,
    name,
    mode: "opinionated",
    seedChroma: swatch.color.c,
    seedLightness: swatch.color.l,
    locked: swatch.locked,
  };
}

function connectionExists(
  objects: Record<string, CloudCanvasObject>,
  fromId: string,
  toId: string,
): boolean {
  return Object.values(objects).some(
    (object) =>
      object.type === "connection" &&
      (((object as Connection).fromId === fromId &&
        (object as Connection).toId === toId) ||
        ((object as Connection).fromId === toId &&
          (object as Connection).toId === fromId)),
  );
}

function connectionPairKey(fromId: string, toId: string): string {
  return [fromId, toId].sort().join("\u0000");
}

function stripReferenceImageTransientFields(
  image: CloudReferenceImage,
): CloudReferenceImage {
  const rest = { ...image };
  delete rest.dataUrl;
  delete rest.renderUrl;
  if (image.imageHandle?.kind === "remote" && image.assetId) {
    rest.imageHandle = { kind: "remote", assetId: image.imageHandle.assetId };
  } else if (rest.assetId) {
    rest.imageHandle = { kind: "remote", assetId: rest.assetId };
  } else {
    delete rest.imageHandle;
  }
  return rest;
}

export function normalizeCloudAction({
  objects,
  action,
  now,
}: NormalizeCloudActionInput): CloudNormalizeResult {
  const currentTime = now ?? Date.now();

  switch (action.type) {
    case "createSwatch": {
      if (
        !isNonEmptyString(action.objectId) ||
        objects[action.objectId] ||
        !isValidColor(action.color) ||
        !isFinitePosition(action.position)
      ) {
        return noChange();
      }
      const swatch: Swatch = {
        id: action.objectId,
        type: "swatch",
        color: purifyForCloudSwatch(action.color),
        position: action.position,
      };
      return {
        patches: [createObject(swatch, ["type", "color", "position"])],
        deletes: [],
      };
    }

    case "updateSwatchColor": {
      const object = objects[action.objectId];
      if (!object || object.type !== "swatch" || !isValidColor(action.color)) {
        return noChange();
      }
      return {
        patches: [
          updateObject(action.objectId, "swatch", { color: action.color }, ["color"]),
        ],
        deletes: [],
      };
    }

    case "moveObject": {
      const object = objects[action.objectId];
      if (
        !object ||
        object.type === "connection" ||
        !isFinitePosition(action.position)
      ) {
        return noChange();
      }
      return {
        patches: [
          updateObject(
            action.objectId,
            object.type,
            { position: action.position } as CloudObjectFieldPatch,
            ["position"],
          ),
        ],
        deletes: [],
      };
    }

    case "promoteToRamp": {
      const object = objects[action.objectId];
      if (
        !isNonEmptyString(action.objectId) ||
        !object ||
        object.type !== "swatch" ||
        !isValidStopCount(action.stopCount)
      ) {
        return noChange();
      }
      const swatch = object as Swatch;
      const ramp = promoteSwatchToRamp(swatch, objects, action.stopCount);
      return {
        patches: [
          replaceObject(ramp, ["type", "ramp"]),
          ...clearMarkersBySwatchIds(objects, new Set([swatch.id]), currentTime),
        ],
        deletes: [],
      };
    }

    case "changeStopCount": {
      const object = objects[action.objectId];
      if (
        !object ||
        object.type !== "ramp" ||
        !isValidStopCount(action.stopCount)
      ) {
        return noChange();
      }
      const ramp = object as Ramp;
      if (ramp.stopCount === action.stopCount) return noChange();
      const solved = solveRampFields(
        normalizeRampConfig(ramp, { stopCount: action.stopCount }),
      );
      return {
        patches: [
          updateObject(
            action.objectId,
            "ramp",
            { ...solved, stopCount: action.stopCount },
            ["ramp"],
          ),
        ],
        deletes: [],
      };
    }

    case "deleteObjects": {
      if (
        !Array.isArray(action.objectIds) ||
        action.objectIds.length > MAX_CONNECTION_ENDPOINTS_PER_ACTION
      ) {
        return noChange();
      }
      const removing = new Set(action.objectIds);
      const swatchIds = new Set<string>();
      const deletes = new Set<string>();
      const remainingObjects: Record<string, CloudCanvasObject> = {};

      for (const [id, object] of Object.entries(objects)) {
        if (removing.has(id)) {
          if (object.type === "swatch") swatchIds.add(id);
          deletes.add(id);
          continue;
        }
        if (
          object.type === "connection" &&
          (removing.has((object as Connection).fromId) ||
            removing.has((object as Connection).toId))
        ) {
          deletes.add(object.id);
          continue;
        }
        remainingObjects[id] = object;
      }

      return {
        patches: clearMarkersBySwatchIds(
          remainingObjects,
          swatchIds,
          currentTime,
        ),
        deletes: [...deletes],
      };
    }

    case "createConnections": {
      if (
        !Array.isArray(action.objectIds) ||
        !Array.isArray(action.connectionIds) ||
        action.objectIds.length > MAX_CONNECTION_ENDPOINTS_PER_ACTION
      ) {
        return noChange();
      }
      const patches: CloudObjectPatch[] = [];
      const endpoints = action.objectIds.filter((id) => {
        const object = objects[id];
        return object?.type === "swatch" || object?.type === "ramp";
      });
      const usedIds = new Set<string>();
      const seenPairs = new Set(
        Object.values(objects)
          .filter((object): object is Connection => object.type === "connection")
          .map((connection) =>
            connectionPairKey(connection.fromId, connection.toId),
          ),
      );

      let connectionIdIndex = 0;
      for (let index = 0; index < endpoints.length - 1; index++) {
        const fromId = endpoints[index];
        const toId = endpoints[index + 1];
        if (fromId === toId || connectionExists(objects, fromId, toId)) continue;
        const pairKey = connectionPairKey(fromId, toId);
        if (seenPairs.has(pairKey)) continue;
        const id = action.connectionIds[connectionIdIndex++];
        if (!isNonEmptyString(id) || objects[id] || usedIds.has(id)) {
          return noChange();
        }
        const connection: Connection = { id, type: "connection", fromId, toId };
        patches.push(createObject(connection, ["type", "connection"]));
        usedIds.add(id);
        seenPairs.add(pairKey);
      }

      return { patches, deletes: [] };
    }

    case "createNote": {
      if (
        !isNonEmptyString(action.objectId) ||
        objects[action.objectId] ||
        !isFinitePosition(action.position)
      ) {
        return noChange();
      }
      const note: Note = {
        id: action.objectId,
        type: "note",
        text: (action.text ?? "").slice(0, MAX_NOTE_LENGTH),
        position: action.position,
      };
      return {
        patches: [createObject(note, ["type", "text", "position"])],
        deletes: [],
      };
    }

    case "updateNoteText": {
      const object = objects[action.objectId];
      if (!object || object.type !== "note" || typeof action.text !== "string") {
        return noChange();
      }
      return {
        patches: [
          updateObject(
            action.objectId,
            "note",
            { text: action.text.slice(0, MAX_NOTE_LENGTH) },
            ["text"],
          ),
        ],
        deletes: [],
      };
    }

    case "addReferenceImage": {
      if (
        objects[action.objectId] ||
        !isNonEmptyString(action.objectId) ||
        !isNonEmptyString(action.assetId) ||
        !isFinitePosition(action.position) ||
        !isValidSize(action.size)
      ) {
        return noChange();
      }
      const image: CloudReferenceImage = {
        id: action.objectId,
        type: "reference-image",
        assetId: action.assetId,
        imageHandle: { kind: "remote", assetId: action.assetId },
        position: action.position,
        size: action.size,
        source: action.source,
      };
      return {
        patches: [createObject(image, ["type", "image", "position"])],
        deletes: [],
      };
    }

    case "createExtraction": {
      const image = objects[action.imageId];
      if (
        !isCloudReferenceImage(image) ||
        !isValidTimestamp(action.timestamp) ||
        !Array.isArray(action.samples) ||
        action.samples.length === 0 ||
        action.samples.length > MAX_EXTRACTION_SAMPLES_PER_ACTION
      ) {
        return noChange();
      }
      const swatchIds = new Set<string>();
      const markerIds = new Set<string>();
      for (const sample of action.samples) {
        if (
          !isNonEmptyString(sample.swatchId) ||
          !isNonEmptyString(sample.markerId) ||
          objects[sample.swatchId] ||
          swatchIds.has(sample.swatchId) ||
          markerIds.has(sample.markerId) ||
          !isValidColor(sample.color) ||
          !isUnitPoint(sample.source) ||
          !isFinitePosition(sample.position)
        ) {
          return noChange();
        }
        swatchIds.add(sample.swatchId);
        markerIds.add(sample.markerId);
      }
      const existing = image.extraction;
      const swatchPatches = action.samples.map((sample) => {
        const swatch: Swatch = {
          id: sample.swatchId,
          type: "swatch",
          color: sample.color,
          position: sample.position,
        };
        return createObject(swatch, ["type", "color", "position"]);
      });
      const markers: ExtractionMarker[] = action.samples.map((sample) => ({
        id: sample.markerId,
        swatchId: sample.swatchId,
        position: sample.source,
        color: sample.color,
      }));
      const extraction = {
        markers,
        createdAt: existing?.createdAt ?? action.timestamp,
        updatedAt: action.timestamp,
      };
      return {
        patches: [
          ...swatchPatches,
          updateObject(
            action.imageId,
            "reference-image",
            { extraction },
            ["extraction"],
          ),
        ],
        deletes: [],
      };
    }

    case "moveExtractionMarker": {
      const image = objects[action.imageId];
      if (
        !isCloudReferenceImage(image) ||
        !image.extraction ||
        !isUnitPoint(action.position) ||
        !isValidColor(action.color)
      ) {
        return noChange();
      }
      const marker = image.extraction.markers.find(
        (item) => item.id === action.markerId,
      );
      if (!marker) return noChange();
      const swatch = objects[marker.swatchId];
      if (!swatch || swatch.type !== "swatch") return noChange();

      const markers = image.extraction.markers.map((item) =>
        item.id === action.markerId
          ? { ...item, position: action.position, color: action.color }
          : item,
      );
      const nextImage = {
        ...image,
        extraction: {
          ...image.extraction,
          markers,
          updatedAt: currentTime,
        },
      };
      return {
        patches: [
          updateObject(
            action.imageId,
            "reference-image",
            { extraction: nextImage.extraction },
            ["extraction"],
          ),
          updateObject(marker.swatchId, "swatch", { color: action.color }, ["color"]),
        ],
        deletes: [],
      };
    }

    case "setBoardSettings": {
      if (!action.settings || typeof action.settings !== "object") {
        return noChange();
      }
      const settings: Partial<CloudBoardSettings> = {};
      if (typeof action.settings.lightMode === "boolean") {
        settings.lightMode = action.settings.lightMode;
      }
      if (typeof action.settings.showConnections === "boolean") {
        settings.showConnections = action.settings.showConnections;
      }
      if (Object.keys(settings).length === 0) return noChange();
      return { patches: [], deletes: [], settings };
    }

    default:
      return noChange();
  }
}

export function applyCloudNormalizeResult(
  objects: Record<string, CloudCanvasObject>,
  result: CloudNormalizeResult,
): Record<string, CloudCanvasObject> {
  const next = { ...objects };
  const deleted = new Set(result.deletes);
  for (const id of result.deletes) delete next[id];
  for (const patch of result.patches) {
    if (deleted.has(patch.objectId)) continue;
    if (patch.kind === "create") {
      if (!next[patch.objectId]) next[patch.objectId] = patch.object;
      continue;
    }
    if (patch.kind === "replace") {
      next[patch.objectId] = patch.object;
      continue;
    }

    const object = next[patch.objectId];
    if (!object || object.type !== patch.type) continue;
    const updated = { ...object, ...patch.patch } as CloudCanvasObject;
    for (const field of patch.unsetFields ?? []) {
      delete (updated as unknown as Record<string, unknown>)[field];
    }
    next[patch.objectId] = updated;
  }
  return next;
}

export function toCloudPersistedCanvasObject(
  object: CloudCanvasObject,
  revision = 0,
): CloudPersistedCanvasObject {
  const data =
    object.type === "reference-image"
      ? stripReferenceImageTransientFields(object)
      : object;
  const errors = validateCloudCanvasObject(data);
  if (errors.length > 0) {
    throw new Error(`Invalid cloud object: ${errors.join("; ")}`);
  }
  return {
    schemaVersion: CLOUD_SCHEMA_VERSION,
    objectId: object.id,
    type: object.type,
    data,
    revision,
  };
}

export function validateCloudCanvasObject(
  object: CloudCanvasObject,
): string[] {
  const errors: string[] = [];
  if (!object.id) errors.push("object.id is required");
  if (!object.type) errors.push("object.type is required");
  if (!VALID_CLOUD_OBJECT_TYPES.has(object.type)) {
    errors.push("object.type is unsupported");
    return errors;
  }

  if (
    object.type !== "connection" &&
    "position" in object &&
    !isFinitePosition(object.position)
  ) {
    errors.push(`${object.type}.position must be finite`);
  }

  if (object.type === "swatch") {
    const swatch = object as Swatch;
    if (!isValidColor(swatch.color)) errors.push("swatch.color is invalid");
  }

  if (object.type === "ramp") {
    const ramp = object as Ramp;
    if (!isValidStopCount(ramp.stopCount)) {
      errors.push("ramp.stopCount is invalid");
    }
    if (!Array.isArray(ramp.stops) || ramp.stops.length === 0) {
      errors.push("ramp.stops is required");
    }
    if (Array.isArray(ramp.stops) && ramp.stops.length !== ramp.stopCount) {
      errors.push("ramp.stops length must match ramp.stopCount");
    }
    if (!isNonEmptyString(ramp.name)) errors.push("ramp.name is required");
    if (!ramp.solveMetadata) errors.push("ramp.solveMetadata is required");
    if (!ramp.targetGamut) errors.push("ramp.targetGamut is required");
    if (ramp.fallbackStops === undefined && ramp.targetGamut === "dual") {
      errors.push("dual-gamut ramp.fallbackStops is required");
    }
    for (const stop of ramp.stops ?? []) {
      if (!isValidColor(stop.color) || !isValidColor(stop.darkColor)) {
        errors.push("ramp.stops colors must be valid");
        break;
      }
    }
  }

  if (object.type === "connection") {
    const connection = object as Connection;
    if (!isNonEmptyString(connection.fromId)) {
      errors.push("connection.fromId is required");
    }
    if (!isNonEmptyString(connection.toId)) {
      errors.push("connection.toId is required");
    }
    if (connection.fromId === connection.toId) {
      errors.push("connection endpoints must be different");
    }
  }

  if (object.type === "reference-image") {
    const image = object as CloudReferenceImage;
    if (!isValidSize(image.size)) errors.push("reference-image.size is invalid");
    if (!isNonEmptyString(image.assetId)) {
      errors.push("reference-image.assetId is required");
    }
    if (image.imageHandle?.kind !== "remote") {
      errors.push("reference-image.imageHandle must be remote");
    }
    if (
      image.assetId &&
      image.imageHandle?.kind === "remote" &&
      image.imageHandle.assetId !== image.assetId
    ) {
      errors.push("reference-image asset ids must match");
    }
    if (image.extraction) {
      if (!isValidTimestamp(image.extraction.createdAt)) {
        errors.push("reference-image.extraction.createdAt is invalid");
      }
      if (!isValidTimestamp(image.extraction.updatedAt)) {
        errors.push("reference-image.extraction.updatedAt is invalid");
      }
      if (image.extraction.updatedAt < image.extraction.createdAt) {
        errors.push("reference-image.extraction timestamps are out of order");
      }
      for (const marker of image.extraction.markers) {
        if (
          !isNonEmptyString(marker.id) ||
          !isNonEmptyString(marker.swatchId) ||
          !isUnitPoint(marker.position) ||
          !isValidColor(marker.color)
        ) {
          errors.push("reference-image.extraction markers are invalid");
          break;
        }
      }
    }
  }

  if (object.type === "note") {
    const note = object as Note;
    if (typeof note.text !== "string") errors.push("note.text must be a string");
    if (note.text.length > MAX_NOTE_LENGTH) {
      errors.push("note.text is too long");
    }
  }

  return errors;
}

export function clampCloudSwatchColor(color: OklchColor): OklchColor {
  const max = maxChroma(color.l, color.h, "display-p3");
  return clampToGamut({ ...color, c: Math.min(color.c, max) }, "display-p3");
}
