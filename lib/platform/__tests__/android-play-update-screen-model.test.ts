import { describe, expect, it } from "vitest";
import {
  createUpdateScreenState,
  reduceUpdateScreenOnInstallEvent,
  resolveUpdateDownloadPercent,
  shouldApplyPolledInstallStatus,
} from "@/lib/platform/android-play-update-screen-model";

describe("update screen model — 페이스북 형태 단계", () => {
  it("percent = floor(bytes / total), unknown total = indeterminate", () => {
    expect(resolveUpdateDownloadPercent(16, 100)).toBe(16);
    expect(resolveUpdateDownloadPercent(999, 1000)).toBe(99);
    expect(resolveUpdateDownloadPercent(120, 100)).toBe(100);
    expect(resolveUpdateDownloadPercent(5, 0)).toBeNull();
    expect(resolveUpdateDownloadPercent(undefined, 100)).toBeNull();
  });

  it("준비 중 → 다운로드 % → 다운로드 완료(자동 설치) → 설치 중", () => {
    let s = createUpdateScreenState("preparing");
    let r = reduceUpdateScreenOnInstallEvent(s, { installStatus: "PENDING" });
    expect(r.screen.step).toBe("preparing");
    r = reduceUpdateScreenOnInstallEvent(r.screen, {
      installStatus: "DOWNLOADING",
      bytesDownloaded: 30,
      totalBytesToDownload: 60,
    });
    expect(r.screen).toMatchObject({ step: "downloading", percent: 50 });
    // Status-only read (no byte counts) keeps the last percent.
    r = reduceUpdateScreenOnInstallEvent(r.screen, { installStatus: "DOWNLOADING" });
    expect(r.screen.percent).toBe(50);
    r = reduceUpdateScreenOnInstallEvent(r.screen, { installStatus: "DOWNLOADED" });
    expect(r).toMatchObject({ screen: { step: "preparing" }, effect: "complete" });
    s = r.screen;
    r = reduceUpdateScreenOnInstallEvent(s, { installStatus: "INSTALLING" });
    expect(r.screen.step).toBe("installing");
  });

  it("call wait: a repeated DOWNLOADED does not install again", () => {
    const s = { ...createUpdateScreenState("preparing"), waitingForCall: true };
    expect(reduceUpdateScreenOnInstallEvent(s, { installStatus: "DOWNLOADED" }).effect).toBe("none");
  });

  it("FAILED → first step with 다시 시도 error; install failure → 「설치」 again", () => {
    const failed = reduceUpdateScreenOnInstallEvent(createUpdateScreenState("downloading"), { installStatus: "FAILED" });
    expect(failed.screen).toMatchObject({ step: "intro", error: "download_failed" });
    const installFailed = reduceUpdateScreenOnInstallEvent(createUpdateScreenState("installing"), {
      installStatus: "FAILED",
    });
    expect(installFailed.screen).toMatchObject({ step: "ready", error: "install_failed" });
  });

  it("CANCELED (Play notification) closes a normal update; a forced one returns to the first step", () => {
    expect(reduceUpdateScreenOnInstallEvent(createUpdateScreenState("downloading"), { installStatus: "CANCELED" }).effect).toBe(
      "close"
    );
    const forced = reduceUpdateScreenOnInstallEvent(createUpdateScreenState("downloading", { forced: true }), {
      installStatus: "CANCELED",
    });
    expect(forced).toMatchObject({ screen: { step: "intro", forced: true }, effect: "none" });
  });

  it("status reads apply forward states only (a stale FAILED / CANCELED never closes a new download)", () => {
    expect(shouldApplyPolledInstallStatus("DOWNLOADING")).toBe(true);
    expect(shouldApplyPolledInstallStatus("DOWNLOADED")).toBe(true);
    expect(shouldApplyPolledInstallStatus("FAILED")).toBe(false);
    expect(shouldApplyPolledInstallStatus("CANCELED")).toBe(false);
    expect(shouldApplyPolledInstallStatus("UNKNOWN")).toBe(false);
  });
});
