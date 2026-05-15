import type {
  Connection,
  ImageExtraction,
  Note,
  OklchColor,
  Point,
  Ramp,
  ReferenceImage,
  ReferenceImageSource,
  Size,
  Swatch,
} from "../types";

export const CLOUD_SCHEMA_VERSION = 1 as const;

export interface CloudBoardSettings {
  lightMode: boolean;
  showConnections: boolean;
}

export type CloudReferenceImage = ReferenceImage;

export type CloudCanvasObject =
  | Swatch
  | Ramp
  | Connection
  | CloudReferenceImage
  | Note;

export interface CloudPersistedCanvasObject {
  schemaVersion: typeof CLOUD_SCHEMA_VERSION;
  objectId: string;
  type: CloudCanvasObject["type"];
  data: CloudCanvasObject;
  revision: number;
}

export type CloudTouchedField =
  | "type"
  | "color"
  | "position"
  | "locked"
  | "text"
  | "connection"
  | "extraction"
  | "image"
  | "ramp"
  | "settings"
  | "selection";

export type CloudObjectFieldPatch =
  | Partial<Swatch>
  | Partial<Ramp>
  | Partial<Connection>
  | Partial<CloudReferenceImage>
  | Partial<Note>;

export type CloudUnsetField =
  | "dataUrl"
  | "renderUrl"
  | "extraction"
  | "fallbackStops";

interface CloudObjectPatchBase {
  objectId: string;
  touchedFields: CloudTouchedField[];
}

export type CloudObjectPatch =
  | (CloudObjectPatchBase & {
      kind: "create";
      object: CloudCanvasObject;
    })
  | (CloudObjectPatchBase & {
      kind: "replace";
      object: CloudCanvasObject;
    })
  | (CloudObjectPatchBase & {
      kind: "update";
      type: CloudCanvasObject["type"];
      patch: CloudObjectFieldPatch;
      unsetFields?: CloudUnsetField[];
    });

export interface CloudNormalizeResult {
  patches: CloudObjectPatch[];
  deletes: string[];
  settings?: Partial<CloudBoardSettings>;
}

export type CloudAction =
  | {
      type: "createSwatch";
      objectId: string;
      position: Point;
      color: OklchColor;
    }
  | {
      type: "updateSwatchColor";
      objectId: string;
      color: OklchColor;
    }
  | {
      type: "moveObject";
      objectId: string;
      position: Point;
    }
  | {
      type: "promoteToRamp";
      objectId: string;
      stopCount: number;
    }
  | {
      type: "changeStopCount";
      objectId: string;
      stopCount: number;
    }
  | {
      type: "deleteObjects";
      objectIds: string[];
    }
  | {
      type: "createConnections";
      objectIds: string[];
      connectionIds: string[];
    }
  | {
      type: "createNote";
      objectId: string;
      position: Point;
      text?: string;
    }
  | {
      type: "updateNoteText";
      objectId: string;
      text: string;
    }
  | {
      type: "addReferenceImage";
      objectId: string;
      assetId: string;
      position: Point;
      size: Size;
      source?: ReferenceImageSource;
    }
  | {
      type: "createExtraction";
      imageId: string;
      timestamp: number;
      samples: {
        swatchId: string;
        markerId: string;
        color: OklchColor;
        source: Point;
        position: Point;
      }[];
    }
  | {
      type: "moveExtractionMarker";
      imageId: string;
      markerId: string;
      position: Point;
      color: OklchColor;
    }
  | {
      type: "setBoardSettings";
      settings: Partial<CloudBoardSettings>;
    };

export function isCloudReferenceImage(
  object: CloudCanvasObject | undefined,
): object is CloudReferenceImage {
  return object?.type === "reference-image";
}

export function isImageExtraction(value: unknown): value is ImageExtraction {
  if (!value || typeof value !== "object") return false;
  const extraction = value as ImageExtraction;
  return Array.isArray(extraction.markers);
}
