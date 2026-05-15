import { describe, expect, it } from "vitest";
import {
  assertCloudAssetUploadsReady,
  assertCloudProvidersReady,
  CloudAccountSetupRequiredError,
  createUnconfiguredCloudBackend,
} from "../client";
import { getCloudSetupStatus, readCloudServiceConfig } from "../config";

describe("cloud backend port", () => {
  it("fails fast before provider accounts are configured", async () => {
    const backend = createUnconfiguredCloudBackend(readCloudServiceConfig({}));

    expect(() => backend.ensureReadyForClientProviders()).toThrow(
      CloudAccountSetupRequiredError,
    );
    await expect(backend.listWorkspaces()).rejects.toMatchObject({
      name: "CloudAccountSetupRequiredError",
      missing: [
        "VITE_CLERK_PUBLISHABLE_KEY",
        "VITE_CONVEX_URL",
      ],
    });
  });

  it("separates client provider readiness from asset upload readiness", () => {
    const status = getCloudSetupStatus(
      readCloudServiceConfig({
        VITE_WASSILY_CLOUD_ENABLED: "true",
        VITE_CLERK_PUBLISHABLE_KEY: "pk_test_123",
        VITE_CONVEX_URL: "https://example.convex.cloud",
      }),
    );

    expect(() => assertCloudProvidersReady(status)).not.toThrow();
    expect(() => assertCloudAssetUploadsReady(status)).toThrow(
      /Upload reference images/,
    );
  });
});
