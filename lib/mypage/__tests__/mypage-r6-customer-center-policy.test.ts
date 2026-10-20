/**
 * 내정보 최종 설계 R6 — S50–S65 (연동 로그인 · 고객센터 허브 · 게시판 · 게시글 · 상담 내역 · 보관함 · 약관 허브)
 * + 잔여: 매장 찜 목록 실패 5xx(S22) · 프로필 편집 단일 시트 링크(X1) · 홈 가격 제안 탭 링크(S23).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authState = vi.hoisted(() => ({ userId: "u1" as string | null, sb: null as unknown }));

vi.mock("@/lib/auth/api-session", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAuthenticatedUserId: async () =>
      authState.userId
        ? { ok: true, userId: authState.userId }
        : { ok: false, response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) },
  };
});
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => authState.sb,
}));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => authState.userId,
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({
  tryGetSupabaseForStores: () => authState.sb,
}));
const identitiesMock = vi.hoisted(() => ({ impl: async (): Promise<unknown[]> => [] }));
vi.mock("@/lib/auth/provider-identity/repository.server", () => ({
  findIdentitiesByUserId: () => identitiesMock.impl(),
}));

import { createFakeSupabase, type FakeCall } from "@/lib/mypage/__tests__/helpers/fake-postgrest";
import { GET as noticesGET } from "@/app/api/me/settings/notices/route";
import { GET as commentsGET } from "@/app/api/me/settings/notices/[noticeId]/comments/route";
import { GET as authProvidersGET } from "@/app/api/me/auth-providers/route";
import { GET as storeFavoritesGET } from "@/app/api/me/store-favorites/list/route";
import { GET as supportCasesGET } from "@/app/api/support/cases/route";
import {
  ccBoardIlikePattern,
  isCcMissingTableError,
  normalizeCcBoardQuery,
  parseCcCursor,
  parseCcPageLimit,
} from "@/lib/mypage/customer-center-board-query";
import {
  formatCustomerCenterRowDate,
  groupCustomerCenterItemsByDate,
} from "@/lib/mypage/customer-center-date-sections";
import {
  SUPPORT_CASE_HISTORY_TAB_STATUSES,
  parseSupportCaseHistoryTab,
  supportCaseHistoryTab,
  supportCaseStatusLabelMeta,
} from "@/lib/support/support-status-label";
import { SUPPORT_CASE_STATUSES } from "@/lib/support/support-case-types";
import { resolveMypageHomeOffersHref } from "@/lib/mypage/mypage-home-row-values";
import { MYPAGE_HOME_TRADE_ITEMS } from "@/lib/mypage/mypage-home-menu-config";
import { MYPAGE_PROFILE_EDIT_SHEET_HREF } from "@/lib/mypage/mypage-profile-routes";
import type { MypageHomeSummaryState } from "@/lib/mypage/mypage-home-summary-client";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function req(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

function noticeRow(i: number, extra: Record<string, unknown> = {}) {
  const ts = new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + i * 60_000).toISOString();
  return {
    id: `n-${String(i).padStart(3, "0")}`,
    content_type: "notice",
    title: `공지 ${i}`,
    body: "본문",
    hero_image_url: null,
    author_label: null,
    is_active: true,
    starts_at: null,
    ends_at: null,
    published_at: ts,
    view_count: 0,
    comment_count: 0,
    comment_enabled: true,
    archived_at: null,
    deleted_at: null,
    created_by: null,
    created_at: ts,
    updated_at: ts,
    ...extra,
  };
}

beforeEach(() => {
  authState.userId = "u1";
  authState.sb = null;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("S61 게시판 API — 실패를 빈 성공으로 응답하지 않음 · 커서 · 서버 검색", () => {
  it("서비스 클라이언트 없음 → 503 (빈 성공 아님)", async () => {
    const res = await noticesGET(req("/api/me/settings/notices?content_type=notice"));
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });

  it("테이블 없음 → 503 table_missing · 그 외 DB 오류 → 500(원문 비노출)", async () => {
    authState.sb = createFakeSupabase(
      {},
      { failErrors: { app_notices: { message: 'relation "public.app_notices" does not exist' } } }
    );
    const r1 = await noticesGET(req("/api/me/settings/notices"));
    expect(r1.status).toBe(503);
    expect((await r1.json()).error).toBe("table_missing");

    authState.sb = createFakeSupabase({}, { failErrors: { app_notices: { message: "secret db detail" } } });
    const r2 = await noticesGET(req("/api/me/settings/notices"));
    expect(r2.status).toBe(500);
    expect(JSON.stringify(await r2.json())).not.toContain("secret");
  });

  it("커서 경계 0 · 1 · 20 · 21 · 마지막 페이지", async () => {
    const run = async (n: number, cursor?: string) => {
      authState.sb = createFakeSupabase({ app_notices: Array.from({ length: n }, (_, i) => noticeRow(i)) });
      const url = `/api/me/settings/notices?content_type=notice${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await noticesGET(req(url));
      expect(res.status).toBe(200);
      return (await res.json()) as { notices: { id: string; href: string; canonicalHref: string }[]; nextCursor: string | null };
    };
    expect(await run(0)).toMatchObject({ notices: [], nextCursor: null });
    const one = await run(1);
    expect(one.notices).toHaveLength(1);
    expect(one.nextCursor).toBeNull();
    const twenty = await run(20);
    expect(twenty.notices).toHaveLength(20);
    expect(twenty.nextCursor).toBeNull();
    const first = await run(21);
    expect(first.notices).toHaveLength(20);
    expect(first.notices[0]?.id).toBe("n-020");
    expect(first.nextCursor).toMatch(/\|n-001$/);
    const last = await run(21, first.nextCursor!);
    expect(last.notices.map((x) => x.id)).toEqual(["n-000"]);
    expect(last.nextCursor).toBeNull();
    // 응답 하위 호환 — 구 경로 href(K11) + canonicalHref
    expect(first.notices[0]?.href).toBe("/mypage/notices/n-020");
    expect(first.notices[0]?.canonicalHref).toBe("/mypage/customer-center/notice/n-020");
  });

  it("잘못된 커서 → 400", async () => {
    authState.sb = createFakeSupabase({ app_notices: [] });
    const res = await noticesGET(req("/api/me/settings/notices?cursor=garbage"));
    expect(res.status).toBe(400);
  });

  it("q = 제목 서버 검색(일치·불일치) · 와일드카드 이스케이프", async () => {
    const calls: FakeCall[] = [];
    authState.sb = createFakeSupabase(
      { app_notices: [noticeRow(1, { title: "점검 안내" }), noticeRow(2, { title: "이벤트" })] },
      { calls }
    );
    const hit = await (await noticesGET(req(`/api/me/settings/notices?q=${encodeURIComponent("점검")}`))).json();
    expect(hit.notices.map((x: { title: string }) => x.title)).toEqual(["점검 안내"]);
    expect(calls.find((c) => c.op === "ilike")?.args).toEqual(["title", "%점검%"]);
    authState.sb = createFakeSupabase({ app_notices: [noticeRow(1, { title: "점검 안내" })] });
    const miss = await (await noticesGET(req("/api/me/settings/notices?q=nomatch"))).json();
    expect(miss.notices).toEqual([]);
    expect(ccBoardIlikePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });

  it("비로그인 → 401", async () => {
    authState.userId = null;
    const res = await noticesGET(req("/api/me/settings/notices"));
    expect(res.status).toBe(401);
  });
});

describe("S62 댓글 API — DB 오류 500 · 커서", () => {
  const ctx = { params: Promise.resolve({ noticeId: "n-1" }) };
  it("DB 오류 → 500 (ok:true 빈 배열 아님)", async () => {
    authState.sb = createFakeSupabase({}, { failErrors: { customer_center_comments: { message: "boom" } } });
    const res = await commentsGET(req("/api/me/settings/notices/n-1/comments"), ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
  it("테이블 없음 → 503 · 서비스 없음 → 503", async () => {
    authState.sb = createFakeSupabase(
      {},
      { failErrors: { customer_center_comments: { message: "x", code: "42P01" } } }
    );
    expect((await commentsGET(req("/api/me/settings/notices/n-1/comments"), ctx)).status).toBe(503);
    authState.sb = null;
    expect((await commentsGET(req("/api/me/settings/notices/n-1/comments"), ctx)).status).toBe(503);
  });
  it("30건 기본 페이지 + 커서(ts|id) 다음 페이지 · 이전 형식(ts) 커서 허용", async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      id: `c-${String(i).padStart(2, "0")}`,
      content_id: "n-1",
      user_id: i === 0 ? "u1" : "u2",
      body: `b${i}`,
      deleted_at: null,
      created_at: new Date(Date.UTC(2026, 9, 1) + i * 1000).toISOString(),
      updated_at: null,
    }));
    authState.sb = createFakeSupabase({ customer_center_comments: rows });
    const p1 = await (await commentsGET(req("/api/me/settings/notices/n-1/comments"), ctx)).json();
    expect(p1.comments).toHaveLength(30);
    expect(p1.nextCursor).toMatch(/\|c-01$/);
    const p2 = await (
      await commentsGET(req(`/api/me/settings/notices/n-1/comments?cursor=${encodeURIComponent(p1.nextCursor)}`), ctx)
    ).json();
    expect(p2.comments.map((c: { id: string; mine: boolean }) => [c.id, c.mine])).toEqual([["c-00", true]]);
    expect(parseCcCursor("2026-10-01T00:00:00.000Z", { allowLegacyTs: true })).toEqual({
      ok: true,
      cursor: null,
      legacyTs: "2026-10-01T00:00:00.000Z",
    });
    expect(parseCcCursor("2026-10-01T00:00:00.000Z").ok).toBe(false);
  });
});

describe("S53 연동 로그인 — API 예외 500 · 화면 계약", () => {
  it("identities 조회 예외 → 500 identities_load_failed (빈 목록 아님)", async () => {
    authState.sb = createFakeSupabase({});
    identitiesMock.impl = async () => {
      throw new Error("db down");
    };
    const res = await authProvidersGET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, errorCode: "identities_load_failed" });
  });
  it("정상 → 제공자 목록 + linkedAt", async () => {
    authState.sb = createFakeSupabase({});
    identitiesMock.impl = async () => [{ provider: "google", linked_at: "2026-10-01T00:00:00Z" }];
    const json = await (await authProvidersGET()).json();
    expect(json.ok).toBe(true);
    expect(json.providers.find((p: { provider: string }) => p.provider === "google")).toMatchObject({
      linked: true,
      linkedAt: "2026-10-01T00:00:00Z",
    });
  });
  it("조회 실패 → 오류 화면 · 409 → 토스트 · 해제는 확인 시트 [확인]에서만 DELETE", () => {
    const src = read("components/my/settings/LinkedLoginProvidersContent.tsx");
    expect(src).toContain('kind="error"');
    expect(src).toContain("last_provider_unlink_blocked");
    expect(src).toMatch(/showMypageToast\([\s\S]*last_provider_unlink_blocked/);
    // handleUnlink 호출은 확인 시트 onConfirm 안 1곳뿐 — 취소(onCancel)는 상태만 닫는다
    expect(src.match(/handleUnlink\(/g)?.length).toBe(1);
    expect(src).toMatch(/onConfirm=\{\(\) => \{[\s\S]*handleUnlink\(target\.provider\)/);
    expect(src).toContain("onCancel={() => setUnlinkTarget(null)}");
    const device = read("components/my/settings/DevicePermissionsSettingsContent.tsx");
    expect(device.indexOf("mypage_s10_device_group")).toBeLessThan(device.indexOf("linked-login-group"));
  });
});

describe("S60 고객센터 허브 — 토큰 · 포인트 CurrencyAmount · LOCK 항목 유지", () => {
  it("hex 0 · 포인트·충전 행 유지(X12) · toLocaleString 없음", () => {
    const ui = read("lib/mypage/customer-center-ui.ts");
    expect(ui).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|rgba\(/);
    const hub = read("components/mypage/cs/CustomerCenterHubClient.tsx");
    expect(hub).not.toMatch(/#[0-9A-Fa-f]{3,8}\b|rgba\(|toLocale|rounded-2xl/);
    for (const href of ["/mypage/support-history", "/mypage/inquiries", "/mypage/points", "/mypage/points/charge"]) {
      expect(hub).toContain(`customerCenterChildHref("${href}")`);
    }
    expect(hub).toContain('data-testid="customer-center-hub"');
    expect(hub).toContain("cc-board-tab-");
  });
  it("포인트 값: 로딩 = 스켈레톤 · 실패 = — · 값 = CurrencyAmount(음수 그대로)", async () => {
    const { customerCenterHubPointsValue } = await import("@/components/mypage/cs/CustomerCenterHubClient");
    const { CurrencyAmount } = await import("@/components/currency/CurrencyAmount");
    expect(customerCenterHubPointsValue({ balance: 0, loading: true, error: false }).valueState).toBe("loading");
    expect(customerCenterHubPointsValue({ balance: 5, loading: false, error: true }).value).toBe("—");
    const v = customerCenterHubPointsValue({ balance: -300, loading: false, error: false }).value as {
      type: unknown;
      props: { currency: string; amount: number };
    };
    expect(v.type).toBe(CurrencyAmount);
    expect(v.props).toMatchObject({ currency: "point", amount: -300 });
  });
  it("CS 화면 전체 hex·toLocale 0", () => {
    for (const f of [
      "CustomerCenterBoardListClient",
      "CustomerCenterBoardDetailClient",
      "CustomerCenterCommentsPanel",
      "CustomerCenterBoardSwitcher",
      "MemberCsNoteListClient",
      "MemberCsNoteThreadClient",
    ]) {
      const src = read(`components/mypage/cs/${f}.tsx`);
      expect(src, f).not.toMatch(/#[0-9A-Fa-f]{6}\b|rgba\(|toLocale(Date|Time)?String|text-red-600/);
    }
  });
});

describe("S61 게시판 화면 — 날짜 PHT · 검색 · 고정 구역 없음(X16)", () => {
  it("PHT 날짜 묶음 — UTC 16:00 은 다음 날", () => {
    const sections = groupCustomerCenterItemsByDate(
      [
        { id: "a", createdAt: "2026-10-20T16:30:00Z" }, // 10-21 00:30 PHT
        { id: "b", createdAt: "2026-10-20T15:30:00Z" }, // 10-20 23:30 PHT
      ],
      "ko"
    );
    expect(sections.map((s) => s.sectionKey)).toEqual(["d:2026-10-21", "d:2026-10-20"]);
    expect(formatCustomerCenterRowDate("2026-10-20T16:30:00Z", "en")).toBe("10/21");
  });
  it("검색 정리 · limit 상한", () => {
    expect(normalizeCcBoardQuery("   ")).toBeNull();
    expect(normalizeCcBoardQuery("x".repeat(150))?.length).toBe(100);
    expect(parseCcPageLimit(null, 20)).toBe(20);
    expect(parseCcPageLimit("999", 20)).toBe(50);
    expect(isCcMissingTableError({ code: "PGRST205", message: "" }, "x")).toBe(true);
    expect(isCcMissingTableError({ message: "column x.y does not exist", code: "42703" }, "x")).toBe(false);
  });
  it("화면: 서버 검색(q) 300ms · 더 보기 · 오류 i18n(원문 비노출) · 고정글 구역 없음", () => {
    const src = read("components/mypage/cs/CustomerCenterBoardListClient.tsx");
    expect(src).toContain("CC_BOARD_SEARCH_DEBOUNCE_MS = 300");
    expect(src).toContain("MyListPager");
    expect(src).toContain('sp.set("q", q)');
    expect(src).not.toContain("json.error");
    expect(src).not.toMatch(/pinned|isPinned|is_pinned/);
  });
});

describe("S62 게시글 상세 — 벨 경로 같은 컴포넌트(X15) · 하단 입력 바 · 삭제 확인", () => {
  it("/mypage/notices/[id] = CustomerCenterBoardDetailClient(리다이렉트 없음)", () => {
    const page = read("app/(main)/mypage/notices/[noticeId]/page.tsx");
    expect(page).toContain("<CustomerCenterBoardDetailClient contentId=");
    expect(page).not.toMatch(/redirect|router\.replace/);
    const detail = read("components/mypage/cs/CustomerCenterBoardDetailClient.tsx");
    expect(detail).toContain("resolveNotificationAwareDetailBackHref");
    expect(detail).toContain("onRetry");
    expect(detail).toContain("mypage_s62_not_found");
  });
  it("[등록] 활성 규칙 · 삭제는 확인 시트 후에만", async () => {
    const { canSubmitCustomerCenterComment, CC_COMMENT_MAX_LEN } = await import(
      "@/components/mypage/cs/CustomerCenterCommentsPanel"
    );
    expect(canSubmitCustomerCenterComment("", false)).toBe(false);
    expect(canSubmitCustomerCenterComment("  ", false)).toBe(false);
    expect(canSubmitCustomerCenterComment("a", false)).toBe(true);
    expect(canSubmitCustomerCenterComment("a", true)).toBe(false);
    expect(canSubmitCustomerCenterComment("a".repeat(CC_COMMENT_MAX_LEN + 1), false)).toBe(false);
    const src = read("components/mypage/cs/CustomerCenterCommentsPanel.tsx");
    expect(src).toContain("useMypageSubmitGuard");
    // DELETE 호출 함수는 확인 시트 onConfirm 안 1곳에서만 불린다(취소 → DELETE 0회)
    expect(src.match(/confirmDelete\(/g)?.length).toBe(1);
    expect(src).toMatch(/onConfirm=\{\(\) => \{[\s\S]*?if \(target\) confirmDelete\(target\)/);
    expect(src).toContain("onCancel={() => setDeleteTarget(null)}");
    expect(src).toContain('data-form-keyboard-footer="1"');
    expect(src).toContain("useMyScreenBackGuard");
  });
});

describe("S63 상담 내역 — 상태 탭 · 커서 · OWNER 불변", () => {
  it("상태 5종 → 탭 2종 (고객 라벨 「상담 종료」 판정과 동일)", () => {
    const table = Object.fromEntries(SUPPORT_CASE_STATUSES.map((s) => [s, supportCaseHistoryTab(s)]));
    expect(table).toEqual({
      OPEN: "active",
      WAITING_ADMIN: "active",
      WAITING_USER: "active",
      RESOLVED: "done",
      ARCHIVED: "done",
    });
    for (const s of SUPPORT_CASE_STATUSES) {
      const done = supportCaseStatusLabelMeta(s).key === "support_status_resolved";
      expect(SUPPORT_CASE_HISTORY_TAB_STATUSES[done ? "done" : "active"]).toContain(s);
    }
    expect(parseSupportCaseHistoryTab("DONE")).toBe("done");
    expect(parseSupportCaseHistoryTab("x")).toBeNull();
  });

  function caseRow(i: number, status: string, audience = "MEMBER") {
    return {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      requester_user_id: "u1",
      audience,
      owner_store_id: null,
      status,
      category: "OTHER",
      last_message_at: new Date(Date.UTC(2026, 9, 1) + i * 1000).toISOString(),
      requester_unread_count: 0,
    };
  }

  it("status=active · 커서 경계(20/21) · counts.active", async () => {
    const rows = [
      ...Array.from({ length: 21 }, (_, i) => caseRow(i, i % 2 ? "OPEN" : "WAITING_USER")),
      caseRow(50, "RESOLVED"),
      caseRow(51, "ARCHIVED"),
    ];
    authState.sb = createFakeSupabase({ support_cases: rows });
    const p1 = await (await supportCasesGET(req("/api/support/cases?audience=MEMBER&status=active&limit=20"))).json();
    expect(p1.cases).toHaveLength(20);
    expect(p1.counts).toEqual({ active: 21 });
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await (
      await supportCasesGET(
        req(`/api/support/cases?audience=MEMBER&status=active&limit=20&cursor=${encodeURIComponent(p1.nextCursor)}`)
      )
    ).json();
    expect(p2.cases).toHaveLength(1);
    expect(p2.nextCursor).toBeNull();
    expect(p2.counts).toBeUndefined();
    const done = await (await supportCasesGET(req("/api/support/cases?audience=MEMBER&status=done"))).json();
    expect(done.cases.map((c: { status: string }) => c.status).sort()).toEqual(["ARCHIVED", "RESOLVED"]);
  });

  it("파라미터 없음(OWNER 기본) → 기존 응답 형태 그대로(nextCursor·counts 없음)", async () => {
    authState.sb = createFakeSupabase({ support_cases: [caseRow(1, "OPEN", "OWNER")] });
    const json = await (await supportCasesGET(req("/api/support/cases?audience=OWNER"))).json();
    expect(Object.keys(json).sort()).toEqual(["cases", "ok"]);
    expect((await supportCasesGET(req("/api/support/cases?status=bogus"))).status).toBe(400);
  });

  it("공유 목록: 탭·커서는 withStatusTabs(MEMBER)만 · OWNER 요청 불변", () => {
    const src = read("components/support/SupportCasesHistoryList.tsx");
    expect(src).toContain('if (withStatusTabs && audience === "MEMBER") return <MemberSupportCasesTabbedList />');
    expect(src).toContain('const qs = new URLSearchParams({ audience });');
    expect(src).toContain("useMypageTabParam");
    expect(src).toContain("MyListPager");
    expect(src).not.toMatch(/toLocale/);
    const owner = read("components/business/owner/OwnerCustomerCenterView.tsx");
    expect(owner).not.toContain("withStatusTabs");
    const member = read("components/support/MemberSupportHistoryClient.tsx");
    expect(member).toContain('<SupportCasesHistoryList audience="MEMBER" withStatusTabs />');
  });
});

describe("S64 이전 문의 보관함 — 유지(날짜·스켈레톤만) · HARD LOCK", () => {
  it("formatMypageDate · 스켈레톤 · 작성 없음 · 사장님 이동 유지", () => {
    const list = read("components/mypage/cs/MemberCsNoteListClient.tsx");
    expect(list).toContain("formatMypageDate(th.last_message_at");
    expect(list).toContain('kind="loading"');
    expect(list).not.toContain('method: "POST"');
    const bridge = read("components/mypage/cs/MypageCsOwnerCareBridge.tsx");
    expect(bridge).toContain("/stores/owner/customer-care/customer-center?tab=");
    expect(bridge).not.toContain("MainFeedRouteLoading");
  });
});

describe("S65 약관 및 정책 허브 — 3행(X13) · 법무 API 실패 시 행 유지", () => {
  it("3행 순서·링크", async () => {
    const { MY_POLICY_HUB_ROWS } = await import("@/components/mypage/settings/MyPolicyHub");
    expect(MY_POLICY_HUB_ROWS.map((r) => [r.id, r.href, r.legalKind])).toEqual([
      ["terms", "/terms", "terms"],
      ["privacy", "/privacy", "privacy"],
      ["business", "/business-info", null],
    ]);
  });
  it("법무 API 실패·문서 없음 → 메타 null(버전 칸 비움), 성공 → 제목·버전·시행일", async () => {
    const { loadPolicyDocMeta, parsePolicyDocMeta } = await import("@/components/mypage/settings/MyPolicyHub");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    expect(await loadPolicyDocMeta("terms", "ko")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await loadPolicyDocMeta("privacy", "en")).toBeNull();
    expect(parsePolicyDocMeta({ ok: true, document: null })).toBeNull();
    expect(
      parsePolicyDocMeta({ ok: true, document: { title: "이용약관", version: "v3", effective_at: "2026-10-01T00:00:00Z" } })
    ).toEqual({ title: "이용약관", version: "v3", effectiveAt: "2026-10-01T00:00:00Z" });
  });
  it("MyPageItemScreen terms 분기 = 허브 · 홈 정책 그룹 3행 그대로", () => {
    const screen = read("components/mypage/MyPageItemScreen.tsx");
    expect(screen).toContain("return <MyPolicyHub />");
    expect(screen).not.toContain("mypage_comp_settings_terms_p1");
    const menu = read("lib/mypage/mypage-home-menu-config.ts");
    const i1 = menu.indexOf('"/mypage/section/settings/terms"');
    const i2 = menu.indexOf('"/privacy"');
    const i3 = menu.indexOf('"/business-info"');
    expect(i1).toBeGreaterThan(0);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
  });
});

describe("잔여 — S22 매장 찜 실패 5xx · X1 프로필 시트 링크 · S23 홈 가격 제안 탭", () => {
  it("매장 찜 목록: 서비스 없음 503 · DB 오류 500 · 비로그인 200 authenticated:false 유지", async () => {
    authState.sb = null;
    expect((await storeFavoritesGET()).status).toBe(503);
    authState.sb = createFakeSupabase({}, { failTables: ["store_favorites"] });
    expect((await storeFavoritesGET()).status).toBe(500);
    authState.sb = createFakeSupabase(
      { store_favorites: [{ user_id: "u1", store_id: "s1", created_at: "2026-10-01" }] },
      { failTables: ["stores"] }
    );
    expect((await storeFavoritesGET()).status).toBe(500);
    authState.userId = null;
    const anon = await storeFavoritesGET();
    expect(anon.status).toBe(200);
    expect(await anon.json()).toEqual({ items: [], authenticated: false });
  });

  it("프로필 편집 진입 = 단일 시트 주소", () => {
    for (const f of [
      "components/mypage/profile/MypageSelfProfileView.tsx",
      "components/mypage/MyPageSidebar.tsx",
      "components/my/ProfileActionButtons.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toContain("MYPAGE_PROFILE_EDIT_SHEET_HREF");
      expect(src, f).not.toMatch(/\bMYPAGE_PROFILE_EDIT_HREF\b/);
    }
    expect(MYPAGE_PROFILE_EDIT_SHEET_HREF).toBe("/mypage?edit=profile");
  });

  it("홈 가격 제안: 받은 대기 > 0 → received, 0 → sent, 모름 → received", () => {
    const state = (field: unknown) => ({ loading: false, fields: { offersReceivedPending: field } }) as unknown as MypageHomeSummaryState;
    expect(resolveMypageHomeOffersHref(state({ status: "ok", value: 3 }))).toBe("/mypage/offers?tab=received");
    expect(resolveMypageHomeOffersHref(state({ status: "ok", value: 0 }))).toBe("/mypage/offers?tab=sent");
    expect(resolveMypageHomeOffersHref(state({ status: "error", value: null }))).toBe("/mypage/offers?tab=received");
    expect(resolveMypageHomeOffersHref(null)).toBe("/mypage/offers?tab=received");
    expect(MYPAGE_HOME_TRADE_ITEMS.find((x) => x.titleKey === "mypage_home_menu_offers")?.hrefSource).toBe("offers-tab");
  });
});
