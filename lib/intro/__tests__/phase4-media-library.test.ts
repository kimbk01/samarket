import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatLabel,
  operatorStatusLabel,
  operatorStatusTone,
  safeFailureMessage,
  toOperatorStatus,
} from "@/components/admin/intro/media/statusLabels";
import {
  ACCEPTED_INTRO_MEDIA_ACCEPT,
  ACCEPTED_INTRO_MEDIA_MIME,
} from "@/components/admin/intro/media/types";

describe("Phase 4 — Media Library operator contracts", () => {
  it("maps backend lifecycle to truthful operator statuses", () => {
    expect(toOperatorStatus("CREATED")).toBe("UPLOADING");
    expect(toOperatorStatus("UPLOADING")).toBe("UPLOADING");
    expect(toOperatorStatus("UPLOADED")).toBe("PROCESSING");
    expect(toOperatorStatus("PROCESSING")).toBe("PROCESSING");
    expect(toOperatorStatus("READY")).toBe("READY");
    expect(toOperatorStatus("FAILED")).toBe("FAILED");
    expect(operatorStatusLabel("READY", true)).toBe("준비됨");
    expect(operatorStatusTone("READY")).toBe("success");
    expect(operatorStatusTone("FAILED")).toBe("danger");
  });

  it("never advertises unsupported formats in accept list", () => {
    expect(ACCEPTED_INTRO_MEDIA_ACCEPT).toContain("image/jpeg");
    expect(ACCEPTED_INTRO_MEDIA_ACCEPT).toContain("image/png");
    expect(ACCEPTED_INTRO_MEDIA_ACCEPT).toContain("image/webp");
    expect(ACCEPTED_INTRO_MEDIA_ACCEPT).toContain("image/gif");
    expect(ACCEPTED_INTRO_MEDIA_ACCEPT).not.toContain("image/heic");
    expect(ACCEPTED_INTRO_MEDIA_ACCEPT).not.toContain("image/avif");
    expect(ACCEPTED_INTRO_MEDIA_ACCEPT).not.toContain("8MB");
    expect(ACCEPTED_INTRO_MEDIA_MIME.has("image/gif")).toBe(true);
    expect(ACCEPTED_INTRO_MEDIA_MIME.has("image/svg+xml")).toBe(false);
  });

  it("formats CANONICAL_ANIMATED_GIF as GIF for operators", () => {
    expect(formatLabel("CANONICAL_ANIMATED_GIF", "image/gif")).toBe("GIF");
    expect(formatLabel("JPEG", "image/jpeg")).toBe("JPEG");
  });

  it("safe failure messages never expose stack traces", () => {
    const msg = safeFailureMessage(
      "PROCESSOR_FAILED",
      "Error: boom\n    at Object.<anonymous> (/tmp/x.js:1:1)",
      true,
    );
    expect(msg).not.toContain("at Object");
    expect(msg).not.toContain("/tmp/");
    expect(msg.length).toBeGreaterThan(10);
  });

  it("one Media Library authority — no ImageUploader/LogoUploader forks", () => {
    expect(existsSync("components/admin/intro/media/IntroMediaLibrary.tsx")).toBe(
      true,
    );
    expect(existsSync("components/admin/intro/media/IntroMediaPicker.tsx")).toBe(
      true,
    );
    expect(existsSync("components/admin/intro/media/IntroMediaUpload.tsx")).toBe(
      true,
    );
    expect(existsSync("components/admin/intro/media/ImageUploader.tsx")).toBe(
      false,
    );
    expect(existsSync("components/admin/intro/media/LogoUploader.tsx")).toBe(
      false,
    );
  });

  it("Admin Media routes exist on product surface", () => {
    const hub = readFileSync("app/admin/intro/IntroRebuildNotice.tsx", "utf8");
    expect(hub).toContain("/admin/intro/media");
    expect(hub).toContain("미디어 라이브러리");
    expect(hub).not.toContain("Set Live");
    expect(hub).not.toContain("Publish");
    expect(existsSync("app/admin/intro/media/page.tsx")).toBe(true);
    expect(existsSync("app/admin/intro/media/picker/page.tsx")).toBe(true);
    expect(
      existsSync("app/api/admin/intro/media/[mediaId]/signed-read/route.ts"),
    ).toBe(true);
  });

  it("upload pipeline uses Phase 3 APIs — no ad-hoc byte proxy", () => {
    const api = readFileSync(
      "components/admin/intro/media/introMediaApi.ts",
      "utf8",
    );
    expect(api).toContain("/api/admin/intro/media/create");
    expect(api).toContain("/signed-upload");
    expect(api).toContain("/confirm-upload");
    expect(api).toContain("/process");
    expect(api).toContain("XMLHttpRequest");
    expect(api).not.toContain("/api/admin/intro/media/upload-proxy");
  });

  it("picker returns mediaRefId authority — not storage path", () => {
    const picker = readFileSync(
      "components/admin/intro/media/IntroMediaPicker.tsx",
      "utf8",
    );
    expect(picker).toContain("mediaRefId");
    expect(picker).toContain("onConfirm");
    expect(picker).not.toContain("storagePath as document");
    const lib = readFileSync(
      "components/admin/intro/media/IntroMediaLibrary.tsx",
      "utf8",
    );
    // Primary cards must not render UUID as primary UX copy.
    expect(lib).not.toMatch(/mediaId\}\s*<\/p>/);
    expect(lib).toContain("originalName");
    expect(lib).toContain("IntroMediaRuntimePreview");
  });

  it("verified-zero still blocks old studio product", () => {
    const page = readFileSync("app/admin/intro/page.tsx", "utf8");
    expect(page).toContain("IntroRebuildNotice");
    expect(page).not.toContain("DibayIntroStudioPage");
    expect(existsSync("components/admin/dibay-intro")).toBe(false);
  });

  it("Phase 4 does not reclassify sharp dependency", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    // Hygiene lock: leave classification untouched in Phase 4.
    expect(pkg.devDependencies?.sharp).toBeTruthy();
  });
});
