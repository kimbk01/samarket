import { describe, expect, it } from "vitest";
import {
  resolveVersionScreenCta,
  resolveVersionScreenCtaVisual,
} from "@/lib/platform/android-play-version-screen-cta";

const base = {
  platformIsAndroidNative: true,
  loading: false,
  checking: false,
  updating: false,
  freshness: "unknown" as const,
  updateInfo: null,
  installStatus: null as null,
  userCanceled: false,
  hasCheckError: false,
};

describe("resolveVersionScreenCta", () => {
  it("disables update CTA when latest", () => {
    const m = resolveVersionScreenCta({ ...base, freshness: "latest" });
    expect(m.statusKind).toBe("latest");
    expect(m.primaryEnabled).toBe(false);
    expect(m.primaryAction).toBe("none");
    expect(m.primaryLabelKind).toBe("update");
  });

  it("enables confirm start when update available", () => {
    const m = resolveVersionScreenCta({ ...base, freshness: "update_available" });
    expect(m.statusKind).toBe("update_available");
    expect(m.primaryEnabled).toBe(true);
    expect(m.primaryAction).toBe("update_confirm");
    expect(m.primaryLabelKind).toBe("update_now");
  });

  it("does not treat check failure as latest", () => {
    const m = resolveVersionScreenCta({
      ...base,
      freshness: "check_failed",
      hasCheckError: true,
    });
    expect(m.statusKind).toBe("check_failed");
    expect(m.primaryAction).toBe("check_retry");
    expect(m.primaryEnabled).toBe(true);
  });

  it("uses install_now when flexible download finished", () => {
    const m = resolveVersionScreenCta({
      ...base,
      freshness: "update_available",
      installStatus: "DOWNLOADED",
    });
    expect(m.statusKind).toBe("install_ready");
    expect(m.primaryAction).toBe("install_now");
  });

  it("disables CTA while checking", () => {
    const m = resolveVersionScreenCta({ ...base, checking: true, freshness: "latest" });
    expect(m.statusKind).toBe("checking");
    expect(m.primaryEnabled).toBe(false);
  });

  it("disables install CTA on non-android", () => {
    const m = resolveVersionScreenCta({
      ...base,
      platformIsAndroidNative: false,
      freshness: "unavailable",
    });
    expect(m.statusKind).toBe("unavailable");
    expect(m.primaryEnabled).toBe(false);
    expect(m.primaryAction).toBe("none");
  });

  it("surfaces canceled with retry when update still available", () => {
    const m = resolveVersionScreenCta({
      ...base,
      freshness: "update_available",
      userCanceled: true,
    });
    expect(m.statusKind).toBe("canceled");
    expect(m.primaryEnabled).toBe(true);
    expect(m.primaryAction).toBe("update_confirm");
  });

  it("maps latest to solid disabled visual (not busy green)", () => {
    const m = resolveVersionScreenCta({ ...base, freshness: "latest" });
    expect(resolveVersionScreenCtaVisual(m)).toBe("disabled");
  });

  it("maps update available to active visual", () => {
    const m = resolveVersionScreenCta({ ...base, freshness: "update_available" });
    expect(resolveVersionScreenCtaVisual(m)).toBe("active");
  });

  it("maps downloading to busy visual with primary disabled", () => {
    const m = resolveVersionScreenCta({
      ...base,
      freshness: "update_available",
      installStatus: "DOWNLOADING",
    });
    expect(m.primaryEnabled).toBe(false);
    expect(resolveVersionScreenCtaVisual(m)).toBe("busy");
  });

  it("maps check failure to retry visual when enabled", () => {
    const m = resolveVersionScreenCta({
      ...base,
      freshness: "check_failed",
      hasCheckError: true,
    });
    expect(resolveVersionScreenCtaVisual(m)).toBe("retry");
  });
});
