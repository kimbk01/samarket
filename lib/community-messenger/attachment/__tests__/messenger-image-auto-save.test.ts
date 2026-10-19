/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messengerMediaRouteUrlFor } from "@/lib/community-messenger/media/messenger-media-ref";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

const saveMessengerImages = vi.fn();
const resolveMessengerImageSaveMode = vi.fn(async () => "native");

vi.mock("@/lib/community-messenger/attachment/messenger-image-save", async (orig) => {
  const actual = await orig<typeof import("@/lib/community-messenger/attachment/messenger-image-save")>();
  return {
    ...actual,
    saveMessengerImages: (urls: string[]) => saveMessengerImages(urls),
    resolveMessengerImageSaveMode: () => resolveMessengerImageSaveMode(),
  };
});

const VIEWER = "viewer-1";
const PEER = "peer-1";
const P = "https://x/storage/v1/object/public/post-images/u/r";

function img(id: string, createdAt: string, over: Partial<CommunityMessengerMessage> = {}) {
  return {
    id,
    roomId: "r",
    senderId: PEER,
    senderLabel: "peer",
    messageType: "image",
    content: `${P}/${id}.thumb.webp`,
    imageOriginalUrl: `${P}/${id}.jpg`,
    createdAt,
    isMine: false,
    callKind: null,
    callStatus: null,
    ...over,
  } as CommunityMessengerMessage;
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("messenger image auto-save", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    saveMessengerImages.mockReset();
    resolveMessengerImageSaveMode.mockReset();
    resolveMessengerImageSaveMode.mockResolvedValue("native");
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.__resetMessengerImageAutoSaveForTests();
  });
  afterEach(() => vi.useRealTimers());

  it("selects only received images after enabledAt; skips mine/pending/deleted/handled", async () => {
    const { selectMessengerImagesForAutoSave } = await import(
      "@/lib/community-messenger/attachment/messenger-image-auto-save"
    );
    const enabledAt = Date.parse("2026-10-15T10:00:00Z");
    const picked = selectMessengerImagesForAutoSave({
      viewerUserId: VIEWER,
      enabledAtMs: enabledAt,
      alreadyHandledIds: new Set(["handled"]),
      messages: [
        img("old", "2026-10-15T09:59:00Z"),
        img("new", "2026-10-15T10:01:00Z"),
        img("mine", "2026-10-15T10:01:00Z", { isMine: true, senderId: VIEWER }),
        { ...img("pend", "2026-10-15T10:01:00Z"), pending: true },
        img("del", "2026-10-15T10:01:00Z", { deletedForEveryoneAt: "2026-10-15T10:02:00Z" }),
        img("handled", "2026-10-15T10:01:00Z"),
        img("txt", "2026-10-15T10:01:00Z", { messageType: "text" }),
      ],
    });
    expect(picked.map((m) => m.id)).toEqual(["new"]);
  });

  it("OFF → never saves", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.autoSaveIncomingMessengerImages({ enabled: false, viewerUserId: VIEWER, messages: [img("a", new Date().toISOString())] });
    await flush();
    expect(saveMessengerImages).not.toHaveBeenCalled();
  });

  it("ON → saves once; re-render / re-fetch / relaunch does not save again", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.syncMessengerImageAutoSaveEnabled(true, Date.now() - 60_000, VIEWER);
    saveMessengerImages.mockResolvedValue({ mode: "native", total: 1, savedCount: 1, failedCount: 0, permissionDenied: false });
    const msgs = [img("a", new Date().toISOString())];
    const notices: string[] = [];
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: msgs, onNotice: (n) => notices.push(n.key) });
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: msgs });
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(1);
    /** C-4: 저장 URL 은 첨부 조회 라우트로 투영된다. */
    expect(saveMessengerImages).toHaveBeenCalledWith([
      messengerMediaRouteUrlFor({ roomId: "r", messageId: "a", src: `${P}/a.jpg` }),
    ]);
    expect(notices).toEqual(["cm_ui_photo_saved"]);
    // 앱 재실행 시뮬레이션: 모듈 메모리 초기화, localStorage 원장은 유지
    mod.__resetMessengerImageAutoSaveForTests();
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: msgs });
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(1);
  });

  it("permission denied → stops retrying until toggled off/on", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.syncMessengerImageAutoSaveEnabled(true, Date.now() - 60_000, VIEWER);
    saveMessengerImages.mockResolvedValue({ mode: "native", total: 1, savedCount: 0, failedCount: 1, permissionDenied: true });
    const notices: string[] = [];
    mod.autoSaveIncomingMessengerImages({
      enabled: true,
      viewerUserId: VIEWER,
      messages: [img("a", new Date().toISOString())],
      onNotice: (n) => notices.push(n.key),
    });
    await flush();
    expect(notices).toEqual(["cm_ui_photo_save_permission_denied"]);
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: [img("b", new Date().toISOString())] });
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(1);
    // 껐다 켜면 새 기준 시각 → 다시 시도
    const reEnabledAt = Date.now() + 5;
    mod.syncMessengerImageAutoSaveEnabled(false);
    mod.syncMessengerImageAutoSaveEnabled(true, reEnabledAt, VIEWER);
    saveMessengerImages.mockResolvedValue({ mode: "native", total: 1, savedCount: 1, failedCount: 0, permissionDenied: false });
    mod.autoSaveIncomingMessengerImages({
      enabled: true,
      viewerUserId: VIEWER,
      messages: [img("c", new Date(reEnabledAt + 10).toISOString())],
    });
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(2);
  });

  it("old binary / web (mode != native) → no auto-save", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.syncMessengerImageAutoSaveEnabled(true, Date.now() - 60_000, VIEWER);
    resolveMessengerImageSaveMode.mockResolvedValue("none");
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: [img("a", new Date().toISOString())] });
    await flush();
    expect(saveMessengerImages).not.toHaveBeenCalled();
  });

  it("enabling does not mass-save history (enabledAt baseline)", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.syncMessengerImageAutoSaveEnabled(true);
    mod.autoSaveIncomingMessengerImages({
      enabled: true,
      viewerUserId: VIEWER,
      messages: [img("history", "2020-01-01T00:00:00Z")],
    });
    await flush();
    expect(saveMessengerImages).not.toHaveBeenCalled();
  });

  it("D-5: full download failure is not marked handled → retried once after the delay, then given up (bounded)", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    const t0 = Date.now();
    mod.syncMessengerImageAutoSaveEnabled(true, t0 - 60_000, VIEWER);
    saveMessengerImages.mockResolvedValue({ mode: "native", total: 1, savedCount: 0, failedCount: 1, permissionDenied: false });
    const msgs = [img("f", new Date(t0 - 1_000).toISOString())];
    const notices: string[] = [];
    const run = (nowMs: number) =>
      mod.autoSaveIncomingMessengerImages({
        enabled: true,
        viewerUserId: VIEWER,
        messages: msgs,
        nowMs,
        onNotice: (n) => notices.push(n.key),
      });
    run(t0);
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(1);
    /** first failure is silent and retried later */
    expect(notices).toEqual([]);
    /** immediate re-render inside the retry delay → no retry */
    run(t0 + 1_000);
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(1);
    /** after the delay → exactly one more attempt; final failure is reported */
    run(Date.now() + mod.MESSENGER_IMAGE_AUTO_SAVE_RETRY_DELAY_MS + 1);
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(2);
    expect(notices).toEqual(["cm_ui_photo_save_failed"]);
    /** never again (no loops), also across relaunch */
    mod.__resetMessengerImageAutoSaveForTests();
    run(Date.now() + 10 * mod.MESSENGER_IMAGE_AUTO_SAVE_RETRY_DELAY_MS);
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(2);
  });

  it("D-5: failure then success on retry → handled once", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    const t0 = Date.now();
    mod.syncMessengerImageAutoSaveEnabled(true, t0 - 60_000, VIEWER);
    saveMessengerImages.mockResolvedValueOnce({ mode: "native", total: 1, savedCount: 0, failedCount: 1, permissionDenied: false });
    saveMessengerImages.mockResolvedValueOnce({ mode: "native", total: 1, savedCount: 1, failedCount: 0, permissionDenied: false });
    const msgs = [img("g", new Date(t0 - 1_000).toISOString())];
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: msgs, nowMs: t0 });
    await flush();
    const later = Date.now() + mod.MESSENGER_IMAGE_AUTO_SAVE_RETRY_DELAY_MS + 1;
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: msgs, nowMs: later });
    await flush();
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: msgs, nowMs: later * 2 });
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(2);
  });

  it("D-5: unsupported/bridge-not-ready mode leaves no ledger entry (re-evaluated next time)", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.syncMessengerImageAutoSaveEnabled(true, Date.now() - 60_000, VIEWER);
    resolveMessengerImageSaveMode.mockResolvedValueOnce("none");
    const msgs = [img("h", new Date(Date.now() - 1_000).toISOString())];
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: msgs });
    await flush();
    saveMessengerImages.mockResolvedValue({ mode: "native", total: 1, savedCount: 1, failedCount: 0, permissionDenied: false });
    mod.autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: VIEWER, messages: msgs });
    await flush();
    expect(saveMessengerImages).toHaveBeenCalledTimes(1);
  });

  it("D-6: enabledAt is per account — another account's old baseline is not reused", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    const old = Date.parse("2026-01-01T00:00:00Z");
    mod.syncMessengerImageAutoSaveEnabled(true, old, "other-account");
    expect(mod.readMessengerImageAutoSaveEnabledAt("other-account")).toBe(old);
    const now = Date.now();
    expect(mod.readMessengerImageAutoSaveEnabledAt(VIEWER, now)).toBe(now);
  });

  it("D-6: legacy global enabled-at key is ignored (no backlog) and removed", async () => {
    window.localStorage.setItem("cm:image-auto-save:enabled-at", String(Date.parse("2020-01-01T00:00:00Z")));
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    mod.autoSaveIncomingMessengerImages({
      enabled: true,
      viewerUserId: VIEWER,
      messages: [img("backlog", "2025-06-01T00:00:00Z")],
    });
    await flush();
    expect(saveMessengerImages).not.toHaveBeenCalled();
  });

  it("D-6: settings backup import OFF→ON (bypassing the toggle handler) resets the baseline", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    const prefs = await import("@/lib/community-messenger/preferences");
    const stale = Date.parse("2026-01-01T00:00:00Z");
    /** ON period with an old baseline */
    prefs.writeCommunityMessengerLocalSetting("mediaAutoSaveEnabled", true);
    mod.syncMessengerImageAutoSaveEnabled(true, stale, VIEWER);
    expect(mod.readMessengerImageAutoSaveEnabledAt(VIEWER)).toBe(stale);
    /** import writes OFF then later ON — no syncMessengerImageAutoSaveEnabled call */
    prefs.writeCommunityMessengerLocalSettings({ mediaAutoSaveEnabled: false });
    prefs.writeCommunityMessengerLocalSettings({ mediaAutoSaveEnabled: true });
    saveMessengerImages.mockResolvedValue({ mode: "native", total: 1, savedCount: 1, failedCount: 0, permissionDenied: false });
    mod.autoSaveIncomingMessengerImages({
      enabled: true,
      viewerUserId: VIEWER,
      messages: [img("between", "2026-06-01T00:00:00Z")],
    });
    await flush();
    expect(saveMessengerImages).not.toHaveBeenCalled();
    expect(mod.readMessengerImageAutoSaveEnabledAt(VIEWER)).toBeGreaterThan(stale);
  });

  it("D-6: unrelated setting writes while ON keep the baseline (ON→ON is not a new period)", async () => {
    const mod = await import("@/lib/community-messenger/attachment/messenger-image-auto-save");
    const prefs = await import("@/lib/community-messenger/preferences");
    prefs.writeCommunityMessengerLocalSetting("mediaAutoSaveEnabled", true);
    const base = Date.now() - 5_000;
    mod.syncMessengerImageAutoSaveEnabled(true, base, VIEWER);
    prefs.writeCommunityMessengerLocalSettings({ linkPreviewEnabled: false });
    expect(mod.readMessengerImageAutoSaveEnabledAt(VIEWER)).toBe(base);
  });
});
