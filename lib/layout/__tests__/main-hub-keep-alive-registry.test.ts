// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createMainHubKeepAliveRegistry,
  shouldClearKeptHubsOnAccountChange,
} from "@/lib/layout/main-hub-keep-alive-registry";

function slot(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("하단 탭 허브 유지 저장소 (설계 §2-1)", () => {
  it("자리에 붙으면 보이고, 떨어지면 상자가 문서에서 빠지되 화면 요소는 보관된다", () => {
    const reg = createMainHubKeepAliveRegistry();
    const s = slot();
    reg.upsert("chat", "CHAT");
    reg.attach("chat", s);
    const box = reg.containerFor("chat");
    expect(box.parentNode).toBe(s);
    expect(reg.getSnapshot().entries).toEqual([{ hubId: "chat", element: "CHAT", attached: true }]);

    reg.detach("chat", s);
    expect(box.isConnected).toBe(false);
    expect(reg.getSnapshot().entries).toEqual([{ hubId: "chat", element: "CHAT", attached: false }]);

    // 다시 방문 — 같은 상자(같은 DOM·상태)를 다시 끼운다
    const s2 = slot();
    reg.attach("chat", s2);
    expect(reg.containerFor("chat")).toBe(box);
    expect(box.parentNode).toBe(s2);
  });

  it("같은 허브 자리가 둘이면 마지막 자리가 소유하고, 소유 자리가 빠지면 남은 자리로 옮긴다", () => {
    const reg = createMainHubKeepAliveRegistry();
    const a = slot();
    const b = slot();
    reg.upsert("home", "HOME");
    reg.attach("home", a);
    reg.attach("home", b);
    const box = reg.containerFor("home");
    expect(box.parentNode).toBe(b);
    reg.detach("home", b);
    expect(box.parentNode).toBe(a);
    expect(reg.getSnapshot().entries[0]?.attached).toBe(true);
    // 소유하지 않은 자리 해제는 상자를 건드리지 않는다
    reg.attach("home", b);
    reg.detach("home", a);
    expect(box.parentNode).toBe(b);
  });

  it("같은 요소 참조 upsert 는 알림을 내지 않는다", () => {
    const reg = createMainHubKeepAliveRegistry();
    let n = 0;
    reg.subscribe(() => {
      n += 1;
    });
    const el = { x: 1 };
    reg.upsert("mypage", el as never);
    reg.upsert("mypage", el as never);
    expect(n).toBe(1);
  });

  it("계정이 바뀌면 붙어 있지 않은 허브만 폐기한다", () => {
    const reg = createMainHubKeepAliveRegistry();
    const s = slot();
    reg.upsert("chat", "CHAT");
    reg.upsert("delivery", "DELIVERY");
    reg.attach("delivery", s);
    reg.clearDetached();
    expect(reg.getSnapshot().entries.map((e) => e.hubId)).toEqual(["delivery"]);

    expect(shouldClearKeptHubsOnAccountChange(null, "u1")).toBe(false);
    expect(shouldClearKeptHubsOnAccountChange("u1", "u1")).toBe(false);
    expect(shouldClearKeptHubsOnAccountChange("u1", "u2")).toBe(true);
    expect(shouldClearKeptHubsOnAccountChange("u1", null)).toBe(true);
  });
});
