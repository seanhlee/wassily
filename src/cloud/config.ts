export const CLOUD_CLIENT_ENV_KEYS = {
  clerkPublishableKey: "VITE_CLERK_PUBLISHABLE_KEY",
  convexUrl: "VITE_CONVEX_URL",
  cloudEnabled: "VITE_WASSILY_CLOUD_ENABLED",
} as const;

export const CLOUD_SERVER_ENV_KEYS = {
  cloudflareAccountId: "CLOUDFLARE_ACCOUNT_ID",
  r2BucketName: "R2_BUCKET_NAME",
} as const;

export const CLOUD_ENV_KEYS = {
  ...CLOUD_CLIENT_ENV_KEYS,
  ...CLOUD_SERVER_ENV_KEYS,
} as const;

export interface CloudServiceConfig {
  clerkPublishableKey?: string;
  convexUrl?: string;
  cloudEnabled: boolean;
  assetUploadsReady?: boolean;
}

export interface CloudServerAssetConfig {
  cloudflareAccountId?: string;
  r2BucketName?: string;
}

export interface CloudSetupStatus {
  cloudEnabled: boolean;
  readyForClientProviders: boolean;
  readyForAssetUploads: boolean;
  missingClient: string[];
  missingServer: string[];
  missing: string[];
}

type EnvRecord = Record<string, string | boolean | undefined>;

export function readCloudServiceConfig(
  env: EnvRecord = import.meta.env,
): CloudServiceConfig {
  return {
    clerkPublishableKey: stringValue(
      env[CLOUD_CLIENT_ENV_KEYS.clerkPublishableKey],
    ),
    convexUrl: stringValue(env[CLOUD_CLIENT_ENV_KEYS.convexUrl]),
    cloudEnabled: booleanValue(env[CLOUD_CLIENT_ENV_KEYS.cloudEnabled]),
  };
}

export function readCloudServerAssetConfig(
  env: EnvRecord,
): CloudServerAssetConfig {
  return {
    cloudflareAccountId: stringValue(
      env[CLOUD_SERVER_ENV_KEYS.cloudflareAccountId],
    ),
    r2BucketName: stringValue(env[CLOUD_SERVER_ENV_KEYS.r2BucketName]),
  };
}

export function getCloudSetupStatus(
  config: CloudServiceConfig,
): CloudSetupStatus {
  const missingClient: string[] = [];
  if (!config.clerkPublishableKey) {
    missingClient.push(CLOUD_CLIENT_ENV_KEYS.clerkPublishableKey);
  }
  if (!config.convexUrl) missingClient.push(CLOUD_CLIENT_ENV_KEYS.convexUrl);

  return {
    cloudEnabled: config.cloudEnabled,
    readyForClientProviders: Boolean(
      config.cloudEnabled && config.clerkPublishableKey && config.convexUrl,
    ),
    readyForAssetUploads: Boolean(config.assetUploadsReady),
    missingClient,
    missingServer: [],
    missing: missingClient,
  };
}

export function getCloudServerAssetStatus(
  config: CloudServerAssetConfig,
): Pick<CloudSetupStatus, "readyForAssetUploads" | "missingServer"> {
  const missingServer: string[] = [];
  if (!config.cloudflareAccountId) {
    missingServer.push(CLOUD_SERVER_ENV_KEYS.cloudflareAccountId);
  }
  if (!config.r2BucketName) {
    missingServer.push(CLOUD_SERVER_ENV_KEYS.r2BucketName);
  }
  return {
    readyForAssetUploads: missingServer.length === 0,
    missingServer,
  };
}

export function describeCloudSetupBoundary(
  status: CloudSetupStatus,
): string {
  if (status.readyForClientProviders && status.readyForAssetUploads) {
    return "Cloud configuration is present.";
  }
  if (!status.cloudEnabled) {
    return "Cloud configuration is present but cloud features are disabled.";
  }
  if (!status.readyForClientProviders) {
    return `Cloud client setup required: ${status.missingClient.join(", ")}`;
  }
  return "Cloud client configuration is present; asset uploads require a backend R2 signer capability.";
}

function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  return value === "true" || value === "1";
}
