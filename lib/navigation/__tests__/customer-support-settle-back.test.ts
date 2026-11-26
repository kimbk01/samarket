/** @vitest-environment jsdom */
/**
 * 고객지원(고객센터) 뒤로 루프 회귀 — Owner 2026-11-26 재현(D1):
 * 내정보 › 고객센터 › 공지사항 › ‹ 가 고객센터를 새로 쌓아(Link push) 고객센터 ‹(기록 뒤로)가 공지사항으로 돌아가는 무한 루프.
 * 가짜 기록 스택 + Navigation API 로 같은 순서를 재생해 「기록이 늘지 않고 내정보 홈까지 나간다」를 고정한다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runPathSettleBack } from "@/lib/navigation/fixed-destination-back";

type Stack = { entries: string[]; index: number };

function installStack(stack: Stack, withNavigationApi: boolean) {
  const origin = window.location.origin;
  if (withNavigationApi) {
    Object.defineProperty(window, "navigation", {
      configurable: true,
      get: () => ({
        currentEntry: { url: origin + stack.entries[stack.index], index: stack.index },
        entries: () => stack.entries.map((u, index) => ({ url: origin + u, index })),
      }),
    });
  }
}

/** 브라우저 기록처럼 동작하는 라우터 — push 는 앞쪽 기록을 지우고 추가, replace 는 교체, back 은 한 칸 뒤 */
function stackRouter(stack: Stack) {
  return {
    push: (href: string) => {
      stack.entries = [...stack.entries.slice(0, stack.index + 1), href];
      stack.index += 1;
    },
    replace: (href: string) => {
      stack.entries[stack.index] = href;
    },
    back: () => {
      if (stack.index > 0) stack.index -= 1;
    },
  };
}

const cur = (s: Stack) => s.entries[s.index];

afterEach(() => {
  Reflect.deleteProperty(window, "navigation");
});

describe("고객지원 뒤로 — 루프·중복 없음 (settle)", () => {
  it("예전 방식(목록 ‹ = push) 재현: 고객센터 ‹ 가 공지사항으로 돌아간다", () => {
    const s: Stack = { entries: ["/mypage", "/mypage/customer-center", "/mypage/customer-center/notice"], index: 2 };
    const r = stackRouter(s);
    r.push("/mypage/customer-center"); // 목록 ‹ (예전 Link push)
    r.back(); // 고객센터 ‹ (기록 뒤로)
    expect(cur(s)).toBe("/mypage/customer-center/notice");
  });

  it("목록 ‹(settle) → 고객지원 ‹(기록 뒤로) → 내정보 홈", () => {
    const s: Stack = { entries: ["/mypage", "/mypage/customer-center", "/mypage/customer-center/notice"], index: 2 };
    installStack(s, true);
    const r = stackRouter(s);
    expect(runPathSettleBack(r, "/mypage/customer-center")).toBe("back");
    expect(cur(s)).toBe("/mypage/customer-center");
    r.back();
    expect(cur(s)).toBe("/mypage");
  });

  it("고객지원 › 공지 › 글 › ‹ › ‹ › ‹ = 내정보 홈 (기록 추가 0)", () => {
    const s: Stack = {
      entries: ["/mypage", "/mypage/customer-center", "/mypage/customer-center/notice", "/mypage/customer-center/notice/n1"],
      index: 3,
    };
    installStack(s, true);
    const r = stackRouter(s);
    runPathSettleBack(r, "/mypage/customer-center/notice");
    runPathSettleBack(r, "/mypage/customer-center");
    r.back();
    expect(cur(s)).toBe("/mypage");
    expect(s.entries.length).toBe(4);
  });

  it("탭 이동(replace) 뒤 ‹ 도 고객지원으로 (시스템 안내 탭)", () => {
    const s: Stack = { entries: ["/mypage", "/mypage/customer-center", "/mypage/customer-center/notice"], index: 2 };
    installStack(s, true);
    const r = stackRouter(s);
    r.replace("/mypage/customer-center/system");
    expect(runPathSettleBack(r, "/mypage/customer-center")).toBe("back");
    expect(cur(s)).toBe("/mypage/customer-center");
  });

  it("고객지원 하위 행(?from=customer-center) — 진입 표시가 달라도 같은 화면으로 본다", () => {
    const s: Stack = { entries: ["/mypage", "/mypage/customer-center", "/mypage/points?from=customer-center"], index: 2 };
    installStack(s, true);
    const r = stackRouter(s);
    expect(runPathSettleBack(r, "/mypage/customer-center")).toBe("back");
  });

  it("알림 → 글 → ‹ = 알림함(직전 기록이면 뒤로), 다른 곳에서 왔으면 목적지로 교체(기록 추가 0)", () => {
    const s: Stack = { entries: ["/home", "/notifications", "/mypage/customer-center/notice/n1"], index: 2 };
    installStack(s, true);
    const r = stackRouter(s);
    expect(runPathSettleBack(r, "/notifications")).toBe("back");
    const s2: Stack = { entries: ["/home", "/mypage/customer-center/notice/n1"], index: 1 };
    installStack(s2, true);
    const r2 = stackRouter(s2);
    expect(runPathSettleBack(r2, "/mypage/customer-center/notice")).toBe("replace");
    expect(s2.entries).toEqual(["/home", "/mypage/customer-center/notice"]);
  });

  it("Navigation API 가 없으면 기록 뒤로 — 목적지를 쌓지 않는다(중복·루프 0)", () => {
    const s: Stack = { entries: ["/mypage", "/mypage/customer-center", "/mypage/customer-center/notice"], index: 2 };
    const r = stackRouter(s);
    Object.defineProperty(window.history, "state", { configurable: true, get: () => ({ idx: 2 }) });
    expect(runPathSettleBack(r, "/mypage/customer-center")).toBe("back");
    expect(cur(s)).toBe("/mypage/customer-center");
    expect(s.entries.length).toBe(3);
    Reflect.deleteProperty(window.history, "state");
  });
});

describe("고객지원 화면군 — 헤더 ‹ 고정 이동(push) 금지", () => {
  const files = [
    "components/mypage/cs/CustomerCenterBoardListClient.tsx",
    "components/mypage/cs/CustomerCenterBoardDetailClient.tsx",
    "components/mypage/reports/MyReportsListClient.tsx",
    "components/mypage/reports/MyReportDetailClient.tsx",
    "components/support/MemberSupportHistoryClient.tsx",
    "components/mypage/cs/MemberCsNoteListClient.tsx",
    "components/mypage/cs/MemberCsNoteThreadClient.tsx",
    "app/(main)/mypage/points/page.tsx",
    "app/(main)/mypage/points/charge/page.tsx",
  ];
  it.each(files)("%s — fixedBackHistory=\"settle\", preferHistoryBack={false} 없음", (f) => {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    expect(src).toContain('fixedBackHistory="settle"');
    expect(src).not.toContain("preferHistoryBack={false}");
  });
  it("글 상세 본문 「목록」 버튼·댓글 이탈 확인도 같은 규칙", () => {
    const detail = readFileSync(join(process.cwd(), "components/mypage/cs/CustomerCenterBoardDetailClient.tsx"), "utf8");
    expect(detail.match(/onClick=\{goToList\}/g)?.length).toBe(2);
    const comments = readFileSync(join(process.cwd(), "components/mypage/cs/CustomerCenterCommentsPanel.tsx"), "utf8");
    expect(comments).toContain("runPathSettleBack(router, backHref)");
    expect(comments).not.toContain("router.push(backHref)");
  });
});
