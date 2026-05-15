import type {
  CloudAssetMetadata,
  PreparedReferenceImageUpload,
  SignedUploadRequest,
  SignedUploadTarget,
} from "./assets";
import {
  describeCloudSetupBoundary,
  getCloudSetupStatus,
  readCloudServiceConfig,
  type CloudServiceConfig,
  type CloudSetupStatus,
} from "./config";
import type { CloudPresenceState } from "./presence";
import type {
  CloudAction,
  CloudBoardSettings,
  CloudNormalizeResult,
  CloudPersistedCanvasObject,
} from "./types";

export interface CloudWorkspaceSummary {
  workspaceId: string;
  name: string;
  role: "owner" | "editor" | "viewer";
}

export interface CloudBoardSummary {
  boardId: string;
  workspaceId: string;
  name: string;
  settings: CloudBoardSettings;
  updatedAt: number;
}

export interface CloudBoardDocument {
  board: CloudBoardSummary;
  objects: CloudPersistedCanvasObject[];
  assets: CloudAssetMetadata[];
}

export interface CreateCloudWorkspaceInput {
  name: string;
  clerkOrgId?: string;
}

export interface CreateCloudBoardInput {
  workspaceId: string;
  name: string;
}

export interface InviteCloudMemberInput {
  workspaceId: string;
  email: string;
  role: "editor" | "viewer";
}

export interface CommitCloudActionInput {
  boardId: string;
  action: CloudAction;
  clientMutationId: string;
  baseRevisions?: Record<string, number>;
}

export interface CommitCloudActionResult {
  actionId: string;
  serverRevision: number;
  createdAt: number;
  normalizeResult: CloudNormalizeResult;
}

export interface SignedRenderUrl {
  boardId: string;
  assetId: string;
  renderUrl: string;
  expiresAt: number;
}

export interface SignedRenderUrlRequest {
  boardId: string;
  assetId: string;
}

export interface CompleteCloudAssetUploadInput {
  boardId: string;
  assetId: string;
  upload: PreparedReferenceImageUpload;
  byteSize: number;
  contentHash?: string;
}

export interface CloudBoardSubscription {
  unsubscribe(): void;
}

export interface CloudBoardSubscriptionHandlers {
  onChange(document: CloudBoardDocument): void;
  onError?(error: Error): void;
}

export interface CloudBackendPort {
  readonly status: CloudSetupStatus;
  ensureReadyForClientProviders(): void;
  ensureReadyForAssetUploads(): void;
  createWorkspace(input: CreateCloudWorkspaceInput): Promise<CloudWorkspaceSummary>;
  createBoard(input: CreateCloudBoardInput): Promise<CloudBoardSummary>;
  inviteMember(input: InviteCloudMemberInput): Promise<void>;
  listWorkspaces(): Promise<CloudWorkspaceSummary[]>;
  listBoards(workspaceId: string): Promise<CloudBoardSummary[]>;
  getBoard(boardId: string): Promise<CloudBoardDocument>;
  subscribeBoard(
    boardId: string,
    handlers: CloudBoardSubscriptionHandlers,
  ): CloudBoardSubscription;
  commitAction(input: CommitCloudActionInput): Promise<CommitCloudActionResult>;
  updatePresence(presence: CloudPresenceState): Promise<void>;
  requestSignedUpload(request: SignedUploadRequest): Promise<SignedUploadTarget>;
  completeUpload(input: CompleteCloudAssetUploadInput): Promise<CloudAssetMetadata>;
  requestSignedRenderUrl(request: SignedRenderUrlRequest): Promise<SignedRenderUrl>;
}

export class CloudAccountSetupRequiredError extends Error {
  readonly missing: string[];
  readonly status: CloudSetupStatus;

  constructor(status: CloudSetupStatus, action: string) {
    const boundary = describeCloudSetupBoundary(status);
    super(`${action} requires cloud account setup. ${boundary}`);
    this.name = "CloudAccountSetupRequiredError";
    this.missing = status.missing;
    this.status = status;
  }
}

export function createUnconfiguredCloudBackend(
  config: CloudServiceConfig = readCloudServiceConfig(),
): CloudBackendPort {
  const status = getCloudSetupStatus(config);

  return {
    status,
    ensureReadyForClientProviders() {
      assertCloudProvidersReady(status, "Use cloud collaboration");
    },
    ensureReadyForAssetUploads() {
      assertCloudAssetUploadsReady(status, "Upload reference images");
    },
    createWorkspace() {
      return rejectAccountSetup(status, "Create a cloud workspace");
    },
    createBoard() {
      return rejectAccountSetup(status, "Create a cloud board");
    },
    inviteMember() {
      return rejectAccountSetup(status, "Invite a workspace member");
    },
    listWorkspaces() {
      return rejectAccountSetup(status, "List cloud workspaces");
    },
    listBoards() {
      return rejectAccountSetup(status, "List cloud boards");
    },
    getBoard() {
      return rejectAccountSetup(status, "Load a cloud board");
    },
    subscribeBoard(_boardId, handlers) {
      void _boardId;
      const error = new CloudAccountSetupRequiredError(
        status,
        "Subscribe to a cloud board",
      );
      handlers.onError?.(error);
      return { unsubscribe() {} };
    },
    commitAction() {
      return rejectAccountSetup(status, "Commit a cloud action");
    },
    updatePresence() {
      return rejectAccountSetup(status, "Update cloud presence");
    },
    requestSignedUpload() {
      return rejectAccountSetup(status, "Request an R2 upload URL");
    },
    completeUpload() {
      return rejectAccountSetup(status, "Finalize an R2 upload");
    },
    requestSignedRenderUrl() {
      return rejectAccountSetup(status, "Request an R2 render URL");
    },
  };
}

export function assertCloudProvidersReady(
  status: CloudSetupStatus,
  action = "Use cloud collaboration",
): void {
  if (!status.readyForClientProviders) {
    throw new CloudAccountSetupRequiredError(status, action);
  }
}

export function assertCloudAssetUploadsReady(
  status: CloudSetupStatus,
  action = "Upload reference images",
): void {
  if (!status.readyForAssetUploads) {
    throw new CloudAccountSetupRequiredError(status, action);
  }
}

function rejectAccountSetup<T>(
  status: CloudSetupStatus,
  action: string,
): Promise<T> {
  return Promise.reject(new CloudAccountSetupRequiredError(status, action));
}
