import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HUB_RETENTION_HUB_IDS,
  nextHubRetentionState,
  resolveHubRetentionViewerKey,
  type HubRetentionState,
} from "@/lib/layout/hub-retention-state";

const root = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** 테스트용 라우터 정보 = "주소#판" (같은 주소의 다른 서버 응답 = 같은 주소·다른 판) */
const base = (viewerKey: string | null = "guest"): HubRetentionState<string> => ({ viewerKey, currentId: null, accountGeneration: 0, entries: [] });
const sameAddress = (a: string, b: string) => a.split("#")[0] === b.split("#")[0];
const step = (s: HubRetentionState<string>, hubId: Parameters<typeof nextHubRetentionState>[1]["hubId"], liveCtx: string, viewerKey: string | null = s.viewerKey) =>
  nextHubRetentionState(s, { hubId, liveCtx, viewerKey, retainable: HUB_RETENTION_HUB_IDS, sameAddress });
const ids = (s: HubRetentionState<string>) => s.entries.map((e) => e.id);
const ctxOf = (s: HubRetentionState<string>, id: string) => s.entries.find((e) => e.id === id)?.ctx;

describe("D1 허브 화면 보관대 상태", () => {
  it("방문한 허브만 순서대로 보관, 숨김 중에는 떠나기 직전 정보 유지", () => {
    let s = step(base(), "home", "/home#1");
    s = step(s, "community", "/philife#1");
    s = step(s, null, "/philife/post/1#1"); // 상세 화면 — 보관 목록 그대로
    expect(ids(s)).toEqual(["home", "community"]);
    expect(ctxOf(s, "home")).toBe("/home#1");
    expect(ctxOf(s, "community")).toBe("/philife#1");
  });

  it("같은 주소로 돌아오면 떠나기 직전 정보로 그림(새 서버 응답으로 다시 만들지 않음) → 그 뒤 라우터가 바뀌면 현재 정보", () => {
    let s = step(base(), "home", "/home#1");
    s = step(s, "mypage", "/mypage#1");
    s = step(s, "home", "/home#2"); // mypage 숨김
    s = step(s, "mypage", "/mypage#2"); // 같은 주소로 복귀
    expect(ctxOf(s, "mypage")).toBe("/mypage#1");
    expect(step(s, "mypage", "/mypage#2")).toBe(s); // 같은 렌더 반복 — 변화 없음
    s = step(s, "mypage", "/mypage#3"); // 새로고침 등 라우터 갱신
    expect(ctxOf(s, "mypage")).toBe("/mypage#3");
  });

  it("다른 주소로 돌아오면(같은 허브 안 다른 검색어 등) 현재 정보", () => {
    let s = step(base(), "trade", "/market?c=a#1");
    s = step(s, "home", "/home#1");
    s = step(s, "trade", "/market?c=b#1");
    expect(ctxOf(s, "trade")).toBe("/market?c=b#1");
  });

  it("바뀐 것이 없으면 같은 객체 (렌더 중 setState 반복 방지)", () => {
    const s = step(base(), "home", "c1");
    expect(step(s, "home", "c1")).toBe(s);
    const d = step(s, null, "x");
    expect(step(d, null, "y")).toBe(d);
  });

  it("채팅 허브는 보관하지 않음 (숨김 중 실시간 시험 전)", () => {
    expect(HUB_RETENTION_HUB_IDS.has("chat")).toBe(false);
    const s = step(base(), "chat", "c1");
    expect(s.entries).toEqual([]);
  });

  it("계정 전환(A→B)·로그아웃·로그인 시 보관 목록 비움, 확인 중은 판정 보류", () => {
    let s = step(base("member:a"), "home", "c1");
    s = step(s, "community", "c2", null); // 확인 중 — 유지
    expect(s.entries.length).toBe(2);
    s = step(s, "community", "c3", "member:b");
    expect(s.entries).toEqual([{ id: "community", ctx: "c3", pinnedLive: null }]);
    s = step(s, "community", "c4", "guest");
    expect(s.entries).toEqual([{ id: "community", ctx: "c4", pinnedLive: null }]);
    expect(s.viewerKey).toBe("guest");
    /** 계정이 바뀔 때마다 세대 증가 — 보관 칸 key 가 바뀌어 같은 허브라도 새로 마운트(이전 계정 화면·60초 기록 재사용 금지) */
    expect(s.accountGeneration).toBe(2);
  });

  it("앱 시작 확인 중 → 회원 확정은 비우지 않음", () => {
    let s = step(base(null), "home", "c1", null);
    s = step(s, "home", "c1", "member:a");
    expect(s.entries.length).toBe(1);
    expect(s.accountGeneration).toBe(0);
  });

  it("계정 키", () => {
    expect(resolveHubRetentionViewerKey({ status: "checking" })).toBeNull();
    expect(resolveHubRetentionViewerKey({ status: "guest" })).toBe("guest");
    expect(resolveHubRetentionViewerKey({ status: "member", profile: { id: " u1 " } })).toBe("member:u1");
  });
});

describe("D1 셸 계약", () => {
  it("보관대는 mainInnerColumn 안(포털 없음) · 허브↔상세 같은 요소 유지", () => {
    const shell = read("components/layout/ConditionalAppShell.tsx");
    expect(shell).toContain("<HubRetentionStack>{children}</HubRetentionStack>");
    expect(shell).toContain("plain={!hubScrollColumn && !f.isCommunityMessengerRoom}");
    const stack = read("components/layout/HubRetentionStack.tsx");
    expect(stack).not.toContain("createPortal");
    /** D1 S2 (2026-11-12): React Activity 대신 CSS 숨김 + 허브 활성 신호 */
    expect(stack).toContain("<HubActiveContext.Provider value={visible}>");
    expect(stack).toContain("key={`hub:${next.accountGeneration}:${entry.id}`}");
    /** 허브가 아닌 화면은 로그인·로그아웃으로 다시 만들지 않음 (PR #146 Bugbot 2차) */
    expect(stack).toContain('<LiveRouteSlot key="live">');
    expect(stack).toContain("LayoutRouterContext.Provider");
    /** 숨긴 허브는 주소 값도 고정 — 다른 탭 주소를 보고 화면을 비우지 않게 */
    expect(stack).toContain("PathnameContext.Provider");
    expect(stack).toContain("SearchParamsContext.Provider");
    expect(stack).toContain("PathParamsContext.Provider");
  });
});
