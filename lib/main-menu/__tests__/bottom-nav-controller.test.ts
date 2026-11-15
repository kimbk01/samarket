/**
 * 하단 탭 컨트롤러 동작 시험 — 계약 v2 (Owner 2026-11-15). 문자열이 아니라 상태 전이를 잠근다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetBottomNavControllerForTest,
  BOTTOM_NAV_SETTLE_WATCHDOG_MS,
  beginBottomNavShowing,
  checkBottomNavWatchdog,
  failBottomNavShowing,
  getBottomNavControllerState,
  isBottomNavShowing,
  isBottomNavTargetReached,
  parseBottomNavTarget,
  settleBottomNavForLocation,
  subscribeBottomNavController,
} from "@/lib/main-menu/bottom-nav-controller";
import { createAppResumeCoordinator } from "@/lib/app-resume/app-resume-coordinator";

let navigated: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T04:00:00Z"));
  navigated = [];
  __resetBottomNavControllerForTest({ documentNavigate: (h) => navigated.push(h) });
});
afterEach(() => {
  __resetBottomNavControllerForTest();
  vi.useRealTimers();
});

describe("목표 주소", () => {
  it("경로·검색 정규화", () => {
    expect(parseBottomNavTarget("/community-messenger/?section=chats&inbox=unread")).toEqual({
      href: "/community-messenger?section=chats&inbox=unread",
      path: "/community-messenger",
      search: "section=chats&inbox=unread",
    });
    expect(isBottomNavTargetReached({ path: "/mypage" }, "/mypage/")).toBe(true);
    expect(isBottomNavTargetReached({ path: "/mypage" }, "/mypage/settings")).toBe(false);
  });
});

describe("손 뗀 순간 → showing → 경로 확정 → idle", () => {
  it("누른 탭 하나만 showing, 경로 도착 때 끝", () => {
    const seen: string[] = [];
    const off = subscribeBottomNavController(() => seen.push(getBottomNavControllerState().phase));
    beginBottomNavShowing({ tabId: "community", href: "/philife" });
    const st = getBottomNavControllerState();
    expect(st.phase).toBe("showing");
    if (st.phase === "showing") expect(st.tabId).toBe("community");
    settleBottomNavForLocation("/stores");
    expect(isBottomNavShowing()).toBe(true);
    settleBottomNavForLocation("/philife");
    expect(isBottomNavShowing()).toBe(false);
    expect(seen).toEqual(["showing", "idle"]);
    off();
  });

  it("연타 = 마지막 탭이 이긴다", () => {
    beginBottomNavShowing({ tabId: "community", href: "/philife" });
    beginBottomNavShowing({ tabId: "my", href: "/mypage" });
    const st = getBottomNavControllerState();
    expect(st.phase === "showing" && st.tabId).toBe("my");
    settleBottomNavForLocation("/philife");
    expect(isBottomNavShowing()).toBe(true);
    settleBottomNavForLocation("/mypage");
    expect(isBottomNavShowing()).toBe(false);
  });

  it("거부 = 원래 탭으로(idle). 다른 이동 id 의 거부는 무시", () => {
    const first = beginBottomNavShowing({ tabId: "community", href: "/philife" });
    const second = beginBottomNavShowing({ tabId: "my", href: "/mypage" });
    failBottomNavShowing(first);
    expect(isBottomNavShowing()).toBe(true);
    failBottomNavShowing(second);
    expect(isBottomNavShowing()).toBe(false);
  });
});

describe("멈춤 감시 — 8초 안에 확정 안 되면 문서 이동 1회", () => {
  it("시간 초과 → location.replace(목표)", () => {
    beginBottomNavShowing({ tabId: "my", href: "/mypage" });
    vi.advanceTimersByTime(BOTTOM_NAV_SETTLE_WATCHDOG_MS - 1);
    expect(navigated).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(navigated).toEqual(["/mypage"]);
    expect(isBottomNavShowing()).toBe(false);
  });

  it("제때 확정되면 문서 이동 없음", () => {
    beginBottomNavShowing({ tabId: "my", href: "/mypage" });
    settleBottomNavForLocation("/mypage");
    vi.advanceTimersByTime(BOTTOM_NAV_SETTLE_WATCHDOG_MS * 2);
    expect(navigated).toEqual([]);
  });

  it("기기 잠자기(타이머 멈춤) 뒤 복귀 판정 — 시계 기준으로 바로 전환", () => {
    beginBottomNavShowing({ tabId: "my", href: "/mypage" });
    /** 타이머는 돌지 않고 시계만 흐른 상황(백그라운드 WebView) */
    vi.setSystemTime(Date.now() + BOTTOM_NAV_SETTLE_WATCHDOG_MS + 5_000);
    checkBottomNavWatchdog();
    expect(navigated).toEqual(["/mypage"]);
  });

  it("아직 시간이 남았으면 복귀 판정은 감시만 다시 건다", () => {
    beginBottomNavShowing({ tabId: "my", href: "/mypage" });
    vi.setSystemTime(Date.now() + 1_000);
    checkBottomNavWatchdog();
    expect(navigated).toEqual([]);
    expect(isBottomNavShowing()).toBe(true);
  });
});

describe("복귀 조정자 ui 레인 — 보이는 즉시 동기 실행", () => {
  it("인증 판정·온라인 대기 없이 noteVisible 안에서 실행, auth 작업보다 먼저", async () => {
    const order: string[] = [];
    let resolveSession: (v: "fresh") => void = () => {};
    const c = createAppResumeCoordinator(
      {
        now: () => Date.now(),
        resolveSession: () => new Promise((r) => (resolveSession = r)),
        waitForIdle: () => Promise.resolve(),
        isOnline: () => false,
        waitForOnline: () => new Promise(() => {}),
        hasOwnLiveCall: () => false,
      },
      { visible: false }
    );
    c.register({ id: "ui", lane: "ui", auth: "none", run: () => void order.push("ui") });
    c.register({ id: "auth", lane: "auth", auth: "required", run: () => void order.push("auth") });
    c.noteVisible("visibilitychange");
    expect(order).toEqual(["ui"]);
    resolveSession("fresh");
    await Promise.resolve();
    expect(order).toEqual(["ui"]);
  });
});

describe("최종 점검 (2026-11-15) — 멈춤·누수 방지", () => {
  it("목표 경로가 지금 경로와 같으면(쿼리만 다른 이동) 시작하지 않는다 — 8초 뒤 문서 이동 방지", () => {
    expect(
      beginBottomNavShowing({ tabId: "orders", href: "/stores/owner/orders?tab=new", fromPath: "/stores/owner/orders/" })
    ).toBeNull();
    expect(isBottomNavShowing()).toBe(false);
    vi.advanceTimersByTime(BOTTOM_NAV_SETTLE_WATCHDOG_MS * 2);
    expect(navigated).toEqual([]);
  });

  it("이동 중 다른 경로로 가면(뒤로가기·다른 이동·리다이렉트) 그 이동이 이긴다 — 뼈대 잔존·감시 문서 이동 없음", () => {
    beginBottomNavShowing({ tabId: "community", href: "/philife", fromPath: "/philife/post/1" });
    settleBottomNavForLocation("/philife/post/1");
    expect(isBottomNavShowing()).toBe(true);
    settleBottomNavForLocation("/home");
    expect(isBottomNavShowing()).toBe(false);
    vi.advanceTimersByTime(BOTTOM_NAV_SETTLE_WATCHDOG_MS * 2);
    expect(navigated).toEqual([]);
  });
});
