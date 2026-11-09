// @vitest-environment jsdom
/**
 * 감사 C (Owner 「결함 수정 진행」 2026-11-10) — 기기에 저장된 이전 상태로 화면을 막지 않는다.
 * ① 막는 쪽(confirmedOnly)은 서버 값만 — 서버 실패면 정식 운영
 * ② 기기 저장값에는 보는 사람 판정(viewerBypass)을 넣지 않는다
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const LS_KEY = "dibay:delivery-launch-state:v1";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  window.localStorage.clear();
});

describe("배달 오픈 상태 — 기기 저장값", () => {
  it("① 기기에 모집이 남아 있어도 서버 실패면 막는 쪽은 정식 운영", async () => {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ mode: "recruiting", viewerBypass: false, content: {} }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const m = await import("@/lib/delivery/launch/use-delivery-launch-state");
    expect(m.peekDeliveryLaunchState({ confirmedOnly: true })).toBeNull();
    expect((await m.fetchDeliveryLaunchState({ confirmedOnly: true })).mode).toBe("open");
    // 화면 표시 쪽(배너 자리)은 마지막 값을 그대로 쓴다
    expect(m.peekDeliveryLaunchState()?.mode).toBe("recruiting");
  });

  it("② 서버가 준 viewerBypass 는 기기에 저장하지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ ok: true, state: { mode: "recruiting", viewerBypass: true, content: {} } }),
      })
    );
    const m = await import("@/lib/delivery/launch/use-delivery-launch-state");
    const s = await m.fetchDeliveryLaunchState({ force: true });
    expect(s.viewerBypass).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(LS_KEY) ?? "{}").viewerBypass).toBe(false);
  });
});
