import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSourcePath,
  buildRuntimeStoragePath,
  buildSourceStoragePath,
  isForbiddenClientUploadPrefix,
  PROCESS_RECIPE,
} from "@/lib/intro/media/paths";
import { AppIntroStorageSubspace } from "@/lib/intro/db/authority";
import { PENDING_UPLOAD_INTEGRITY, integrityOf } from "@/lib/intro/media/integrity";
import { GIF_RUNTIME_CONTRACT } from "@/lib/intro/contracts/gif";

describe("Phase 3 — media authority static contracts", () => {
  it("source/runtime paths stay under canonical prefixes", () => {
    const mediaId = "11111111-1111-1111-1111-111111111111";
    const sourceGenerationId = "22222222-2222-2222-2222-222222222222";
    const runtimeArtifactId = "33333333-3333-3333-3333-333333333333";
    const source = buildSourceStoragePath({ mediaId, sourceGenerationId });
    const runtime = buildRuntimeStoragePath({
      mediaId,
      runtimeArtifactId,
      ext: "gif",
    });
    expect(source.startsWith(AppIntroStorageSubspace.SOURCE)).toBe(true);
    expect(runtime.startsWith(AppIntroStorageSubspace.RUNTIME)).toBe(true);
    expect(source.includes("..")).toBe(false);
    expect(source.endsWith("/original")).toBe(true);
    assertSourcePath(source);
    expect(isForbiddenClientUploadPrefix(runtime)).toBe(true);
    expect(isForbiddenClientUploadPrefix(AppIntroStorageSubspace.SEALED + "x")).toBe(
      true,
    );
    expect(isForbiddenClientUploadPrefix(AppIntroStorageSubspace.PACKS + "x")).toBe(
      true,
    );
  });

  it("pending upload integrity marker is distinct from sha256", () => {
    expect(PENDING_UPLOAD_INTEGRITY).toBe("PENDING_UPLOAD");
    expect(integrityOf(Buffer.from("x")).startsWith("sha256:")).toBe(true);
  });

  it("omggif is a production dependency and fixtures exist", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies.omggif).toBeTruthy();
    for (const id of [
      "01_normal_multiframe",
      "02_transparent",
      "03_looping",
      "04_varied_delay",
      "05_disposal_sensitive",
    ]) {
      const buf = readFileSync(
        join(process.cwd(), "fixtures/intro/gif", `${id}.gif`),
      );
      expect(buf.length).toBeGreaterThan(0);
    }
  });

  it("GIF contract still forbids cgif and selects B2", () => {
    expect(GIF_RUNTIME_CONTRACT.forbiddenPaths).toContain("SHARP_CGIF_ENCODE");
    expect(GIF_RUNTIME_CONTRACT.processingPath).toBe(
      "B2_SHARP_PAGES_OMGGIF_ENCODE",
    );
    expect(PROCESS_RECIPE.GIF_B2_SHARP_OMGGIF_V1).toContain("OMGGIF");
  });
});
