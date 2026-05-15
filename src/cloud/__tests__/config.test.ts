import { describe, expect, it } from "vitest";
import {
  describeCloudSetupBoundary,
  getCloudServerAssetStatus,
  getCloudSetupStatus,
  readCloudServerAssetConfig,
  readCloudServiceConfig,
} from "../config";

describe("cloud config", () => {
  it("reads public client config without requiring account values", () => {
    expect(readCloudServiceConfig({})).toEqual({
      cloudEnabled: false,
      clerkPublishableKey: undefined,
      convexUrl: undefined,
    });
  });

  it("marks provider wiring ready only after Clerk and Convex are configured", () => {
    const status = getCloudSetupStatus(
      readCloudServiceConfig({
        VITE_WASSILY_CLOUD_ENABLED: "true",
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_123",
        VITE_CONVEX_URL: "https://example.convex.cloud",
      }),
    );

    expect(status.readyForClientProviders).toBe(true);
    expect(status.readyForAssetUploads).toBe(false);
    expect(status.cloudEnabled).toBe(true);
    expect(status.missing).toEqual([]);
  });

  it("describes the account setup boundary", () => {
    const status = getCloudSetupStatus(readCloudServiceConfig({}));
    expect(describeCloudSetupBoundary(status)).toContain("disabled");
  });

  it("keeps R2 account values in server-side setup status", () => {
    const status = getCloudServerAssetStatus(
      readCloudServerAssetConfig({
        CLOUDFLARE_ACCOUNT_ID: "account-1",
      }),
    );

    expect(status.readyForAssetUploads).toBe(false);
    expect(status.missingServer).toEqual(["R2_BUCKET_NAME"]);
  });
});
