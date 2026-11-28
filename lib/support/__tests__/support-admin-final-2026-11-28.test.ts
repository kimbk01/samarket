/**
 * 고객센터 최종 감사 2026-11-28 — 어드민 화면 수정 (D1 클라이언트 · D6 · U-6 · U-9 · U-11 · U-13 · U-14).
 * 근거: docs/audit/customer-support-inquiry-final-2026-11-28/final-audit.md §2.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 탭·바로가기·분야 이름을 검사한다
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { buildAdminSupportPublicReplyPayload } from "@/components/admin/support/admin-support-reply";
import {
  ADMIN_SUPPORT_OWN_WRITE_GRACE_MS,
  ADMIN_SUPPORT_OFF_LIST_REFRESH_MS,
  isOffListSupportCaseUpdate,
  adminMeCanReceiveSupportRealtime,
  isAdminSupportOwnWriteEcho,
  shouldRefetchSupportListForCaseChange,
} from "@/components/admin/support/admin-support-realtime";
import { ADMIN_SUPPORT_TAB_LABEL_KEY, adminSupportStatusTone } from "@/components/admin/support/admin-support-status";
import { ADMIN_SUPPORT_TABS } from "@/lib/support/support-case-types";
import { supportAdminStatusLabel } from "@/lib/support/support-status-label";
import { SUPPORT_CATEGORY_GROUPS } from "@/lib/support/support-category-groups";
import {
  resolveSupportCaseContextLinks,
  resolveSupportReferenceAdminHref,
} from "@/lib/support/support-reference-admin-href";
import type { AdminMeSnapshot } from "@/lib/admin-auth/admin-me-context";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PAGE = "components/admin/support/AdminSupportPage.tsx";
const COMMUNITY = "components/admin/community/support/AdminCommunitySupportPage.tsx";
const BRIDGE = "components/admin/store-points/AdminStorePointPendingProvider.tsx";

describe("D1 — 공개 답변에 어드민이 본 마지막 글 시각을 보낸다", () => {
  it("본 시각이 있으면 seenLastMessageAt 를 넣는다", () => {
    expect(buildAdminSupportPublicReplyPayload("hi", "2026-11-28T01:00:00.000Z")).toEqual({
      action: "reply",
      body: "hi",
      seenLastMessageAt: "2026-11-28T01:00:00.000Z",
    });
  });
  it("본 시각이 없으면 넣지 않는다 (빈 값을 보내지 않음)", () => {
    expect(buildAdminSupportPublicReplyPayload("hi", null)).toEqual({ action: "reply", body: "hi" });
    expect(buildAdminSupportPublicReplyPayload("hi", "  ")).toEqual({ action: "reply", body: "hi" });
  });
  it("콘솔은 마지막으로 불러온 상세의 last_message_at 을 쓰고, 답변 뒤 상세를 다시 읽는다 (구조 확인)", () => {
    const src = read(PAGE);
    // 점검 H1(2026-11-28): 보이는 문의(activeCase) 값·id 로만 보낸다 — 동작 시험은 support-admin-final-check-console.test.tsx
    expect(src).toContain("buildAdminSupportPublicReplyPayload(text, activeCase.last_message_at, intent.requestId)");
    const patch = src.slice(src.indexOf("const patchCase"), src.indexOf("const categoryLabel"));
    expect(patch).toContain("await loadDetail(writeCaseId)");
  });
});

describe("D6(a) — 문의 행 변경은 목록에 보이는 값이 바뀔 때만 목록을 다시 읽는다", () => {
  const listed = [
    {
      id: "c1",
      status: "WAITING_ADMIN",
      assigned_admin_id: null,
      last_message_at: "2026-11-28T01:00:00Z",
      priority: "NORMAL",
      admin_unread_count: 3,
    },
  ];
  const row = (patch: Record<string, unknown>) => ({ ...listed[0], ...patch });

  it("INSERT 는 다시 읽는다", () => {
    expect(
      shouldRefetchSupportListForCaseChange({ eventType: "INSERT", newRow: { id: "new" }, listed, tab: "ACTIONABLE" })
    ).toBe(true);
  });
  it("고객 쪽 읽음 숫자만 바뀐 UPDATE 는 다시 읽지 않는다 (어드민 미읽음은 목록 표시값 — 재감사 D6-b)", () => {
    expect(
      shouldRefetchSupportListForCaseChange({
        eventType: "UPDATE",
        newRow: row({ requester_unread_count: 0, last_message_at: "2026-11-28T01:00:00.000+00:00" }),
        listed,
        tab: "ACTIONABLE",
      })
    ).toBe(false);
  });
  it.each([
    ["status", { status: "WAITING_USER" }],
    ["assigned_admin_id", { assigned_admin_id: "a1" }],
    ["last_message_at", { last_message_at: "2026-11-28T02:00:00Z" }],
    ["priority", { priority: "URGENT" }],
  ])("%s 가 바뀌면 다시 읽는다", (_f, patch) => {
    expect(
      shouldRefetchSupportListForCaseChange({ eventType: "UPDATE", newRow: row(patch), listed, tab: "ACTIONABLE" })
    ).toBe(true);
  });
  it("목록에 없는 문의는 새 상태가 지금 탭에 속할 때만 다시 읽는다", () => {
    const other = { id: "c9", status: "OPEN" };
    expect(
      shouldRefetchSupportListForCaseChange({ eventType: "UPDATE", newRow: other, listed, tab: "ACTIONABLE" })
    ).toBe(true);
    expect(
      shouldRefetchSupportListForCaseChange({ eventType: "UPDATE", newRow: other, listed, tab: "RESOLVED" })
    ).toBe(false);
    expect(shouldRefetchSupportListForCaseChange({ eventType: "UPDATE", newRow: other, listed, tab: "ALL" })).toBe(true);
  });
  it("DELETE 는 목록에 있던 문의일 때만", () => {
    expect(
      shouldRefetchSupportListForCaseChange({ eventType: "DELETE", newRow: {}, oldRow: { id: "c1" }, listed, tab: "ALL" })
    ).toBe(true);
    expect(
      shouldRefetchSupportListForCaseChange({ eventType: "DELETE", newRow: {}, oldRow: { id: "zz" }, listed, tab: "ALL" })
    ).toBe(false);
  });
  it("콘솔 구독은 판정 함수를 거친다 — 모든 변경마다 목록을 읽지 않는다 (구조 확인)", () => {
    const src = read(PAGE);
    expect(src).toContain("shouldRefetchSupportListForCaseChange({");
    expect(src).not.toContain('table: "support_cases" }, scheduleList)');
  });
});

describe("D6(b) — 내 답변의 실시간 메아리로 상세·목록을 두 번 읽지 않는다", () => {
  const now = 1_000_000;
  const ownWrite = { caseId: "c1", until: now + ADMIN_SUPPORT_OWN_WRITE_GRACE_MS };
  it("내 글 INSERT(같은 문의·잠깐 안)는 건너뛴다", () => {
    expect(
      isAdminSupportOwnWriteEcho({ ownWrite, caseId: "c1", now, kind: "message", senderAdminId: "me", selfAdminId: "me" })
    ).toBe(true);
  });
  it("고객 글·다른 어드민 글·다른 문의·시간 지난 뒤는 다시 읽는다", () => {
    expect(
      isAdminSupportOwnWriteEcho({ ownWrite, caseId: "c1", now, kind: "message", senderAdminId: null, selfAdminId: "me" })
    ).toBe(false);
    expect(
      isAdminSupportOwnWriteEcho({ ownWrite, caseId: "c1", now, kind: "message", senderAdminId: "a2", selfAdminId: "me" })
    ).toBe(false);
    expect(
      isAdminSupportOwnWriteEcho({ ownWrite, caseId: "c2", now, kind: "message", senderAdminId: "me", selfAdminId: "me" })
    ).toBe(false);
    expect(
      isAdminSupportOwnWriteEcho({
        ownWrite,
        caseId: "c1",
        now: now + ADMIN_SUPPORT_OWN_WRITE_GRACE_MS + 1,
        kind: "message",
        senderAdminId: "me",
        selfAdminId: "me",
      })
    ).toBe(false);
    expect(isAdminSupportOwnWriteEcho({ ownWrite: null, caseId: "c1", now, kind: "case" })).toBe(false);
  });
  it("보내는 동안(끝 없음) 같은 문의 행 변경은 건너뛴다", () => {
    expect(
      isAdminSupportOwnWriteEcho({
        ownWrite: { caseId: "c1", until: Number.POSITIVE_INFINITY },
        caseId: "c1",
        now,
        kind: "case",
      })
    ).toBe(true);
  });
  it("재감사 D6-c: 보낸 뒤(유예 중)라도 문의 행 변경은 건너뛰지 않는다 — 다른 어드민 변경 반영", () => {
    expect(
      isAdminSupportOwnWriteEcho({
        ownWrite: { caseId: "c1", until: now + ADMIN_SUPPORT_OWN_WRITE_GRACE_MS },
        caseId: "c1",
        now,
        kind: "case",
      })
    ).toBe(false);
  });
  it("재감사 D6-a·D6-b: 목록 밖 문의 UPDATE = 느린 다시 읽기 대상 · 목록 안 미읽음 숫자 변경 = 바로 다시 읽기", () => {
    const listed = [{ id: "c1", status: "OPEN", admin_unread_count: 2 }];
    expect(isOffListSupportCaseUpdate({ eventType: "UPDATE", newRow: { id: "c9", status: "RESOLVED" }, listed })).toBe(true);
    expect(isOffListSupportCaseUpdate({ eventType: "UPDATE", newRow: { id: "c1", status: "OPEN" }, listed })).toBe(false);
    expect(isOffListSupportCaseUpdate({ eventType: "INSERT", newRow: { id: "c9" }, listed })).toBe(false);
    expect(
      shouldRefetchSupportListForCaseChange({
        eventType: "UPDATE",
        newRow: { id: "c1", status: "OPEN", admin_unread_count: 0 },
        listed,
        tab: "ACTIONABLE",
      })
    ).toBe(true);
    expect(ADMIN_SUPPORT_OFF_LIST_REFRESH_MS).toBe(30_000);
  });
  it("patchCase 가 보내기 전·후에 내 변경 표시를 남긴다 (구조 확인)", () => {
    const src = read(PAGE);
    const patch = src.slice(src.indexOf("const patchCase"), src.indexOf("const categoryLabel"));
    expect(patch).toContain("until: Number.POSITIVE_INFINITY");
    expect(patch).toContain("Date.now() + ADMIN_SUPPORT_OWN_WRITE_GRACE_MS");
  });
});

describe("D6(c) — 고객센터 실시간은 support 권한 어드민만 받는다", () => {
  const me = (patch: Partial<AdminMeSnapshot>): AdminMeSnapshot => ({
    userId: "u",
    role: "admin",
    uiRole: "operator",
    adminTier: null,
    permissions: [],
    loginId: "u",
    displayName: "u",
    ...patch,
  });
  it("권한 판정", () => {
    expect(adminMeCanReceiveSupportRealtime(null)).toBe(false);
    expect(adminMeCanReceiveSupportRealtime(me({}))).toBe(false);
    expect(adminMeCanReceiveSupportRealtime(me({ permissions: ["users"] }))).toBe(false);
    expect(adminMeCanReceiveSupportRealtime(me({ permissions: ["support"] }))).toBe(true);
    expect(adminMeCanReceiveSupportRealtime(me({ role: "super_admin" }))).toBe(true);
  });
  it("벨 브리지는 support 표 구독을 권한 판정 뒤에만 붙인다 (구조 확인)", () => {
    const src = read(BRIDGE);
    const gate = src.indexOf("const withSupport = supportRealtimeAllowed");
    expect(src).toContain("adminMeCanReceiveSupportRealtime(me)");
    expect(src).toContain("me = await fetchAdminMeSnapshot()");
    expect(gate).toBeGreaterThan(0);
    const before = src.slice(0, gate);
    expect(before).not.toContain('table: "support_messages" }');
    expect(before).not.toContain('table: "support_cases" }');
    const after = src.slice(gate, src.indexOf(": opsChannel;", gate));
    expect(after).toContain('table: "support_messages" }');
    expect(after).toContain('{ event: "INSERT", schema: "public", table: "support_cases" }');
    expect(after).toContain('{ event: "UPDATE", schema: "public", table: "support_cases" }');
  });
});

describe("U-6 · U-13 — 어드민 문의 상태 정의 하나", () => {
  it("같은 상태 = 같은 색: 답변 필요 빨강 · 고객 확인 대기 노랑 · 종료·보관 회색", () => {
    expect(adminSupportStatusTone("OPEN")).toBe("danger");
    expect(adminSupportStatusTone("WAITING_ADMIN")).toBe("danger");
    expect(adminSupportStatusTone("WAITING_USER")).toBe("waiting");
    expect(adminSupportStatusTone("RESOLVED")).toBe("neutral");
    expect(adminSupportStatusTone("ARCHIVED")).toBe("neutral");
  });
  it("탭 이름: 답변 필요 / 고객 확인 대기 / 종료 / 보관 / 전체", () => {
    expect(ADMIN_SUPPORT_TABS.map((id) => translate("ko", ADMIN_SUPPORT_TAB_LABEL_KEY[id]))).toEqual([
      "답변 필요",
      "고객 확인 대기",
      "종료",
      "보관",
      "전체",
    ]);
  });
  it("U-13: 종료·보관 탭 영어 = 상태 알약 영어 (Resolved · Archived)", () => {
    for (const status of ["RESOLVED", "ARCHIVED", "WAITING_USER"] as const) {
      expect(translate("en", ADMIN_SUPPORT_TAB_LABEL_KEY[status])).toBe(supportAdminStatusLabel(status, (k) => translate("en", k)));
      expect(translate("ko", ADMIN_SUPPORT_TAB_LABEL_KEY[status])).toBe(supportAdminStatusLabel(status, (k) => translate("ko", k)));
    }
    expect(translate("en", ADMIN_SUPPORT_TAB_LABEL_KEY.RESOLVED)).toBe("Resolved");
  });
  it("두 화면이 같은 정의를 쓴다 · 화면별 색 표 없음 · 커뮤니티 알약은 화면 언어 (구조 확인)", () => {
    const page = read(PAGE);
    const community = read(COMMUNITY);
    for (const src of [page, community]) {
      expect(src).toContain("ADMIN_SUPPORT_TAB_LABEL_KEY");
      expect(src).toContain("adminSupportStatusTone(");
    }
    expect(page).not.toContain("function statusTone(");
    expect(page).not.toContain("admin_stores_inquiries_status_closed");
    expect(community).not.toContain("STATUS_TONE");
    expect(community).not.toContain('supportAdminStatusLabel(c.status, language !== "en")');
    expect(community).toContain("supportAdminStatusLabel(c.status, t)");
    // 커뮤니티 화면 주소 값은 그대로
    expect(community).toContain('waiting: "ACTIONABLE"');
    expect(community).toContain('waiting_user: "WAITING_USER"');
  });
});

describe("U-9 — 분야·바로가기 이름은 카탈로그 키 (코드 안 문구·개발 용어 없음)", () => {
  const hasKo = (k: MessageKey) => translate("ko", k) !== k && translate("ko", k).length > 0;
  const hasEn = (k: MessageKey) => translate("en", k) !== k && translate("en", k).length > 0;
  it("분야 그룹마다 ko·en 문구", () => {
    for (const g of SUPPORT_CATEGORY_GROUPS) {
      expect(hasKo(g.labelKey), g.id).toBe(true);
      expect(hasEn(g.labelKey), g.id).toBe(true);
    }
  });
  it("모든 바로가기 링크 이름에 ko·en 문구 · (B3)(B4) 같은 내부 표기 없음", () => {
    const src = read("lib/support/support-reference-admin-href.ts");
    const types = [...src.matchAll(/case "([A-Z_]+)":/g)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(15);
    const links = [
      ...resolveSupportCaseContextLinks({ ownerStoreId: "s1", requesterUserId: "u1" }),
      ...types.map((ty) => resolveSupportReferenceAdminHref(ty, "id1")).filter((l) => l != null),
    ];
    for (const link of links) {
      expect(hasKo(link.labelKey), link.href).toBe(true);
      expect(hasEn(link.labelKey), link.href).toBe(true);
      for (const lang of ["ko", "en"] as const) {
        expect(translate(lang, link.labelKey)).not.toMatch(/\(B\d\)/);
      }
    }
  });
  it("두 모듈 코드 문자열에 한국어 없음 · 화면은 t(key) (구조 확인)", () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const rel of ["lib/support/support-reference-admin-href.ts", "lib/support/support-category-groups.ts"]) {
      const code = strip(read(rel));
      expect(code, rel).not.toMatch(/[가-힣]/);
      expect(code, rel).not.toMatch(/label(Ko|En)\s*:/);
    }
    const page = read(PAGE);
    expect(page).not.toMatch(/ko \? (g|link)\.labelKo/);
    expect(page).toContain("t(link.labelKey)");
    expect(page).toContain("t(g.labelKey)");
  });
});

describe("U-11 — 보관 문의에서도 바로 재오픈", () => {
  it("ARCHIVED 블록에 재오픈과 보관 해제가 함께 있다 (구조 확인)", () => {
    const src = read(PAGE);
    const start = src.indexOf('{st === "ARCHIVED" ? (');
    const block = src.slice(start, src.indexOf(") : null}", start));
    expect(block).toContain('data-admin-support-reopen="1"');
    expect(block).toContain('{ action: "reopen" }');
    expect(block).toContain('data-admin-support-unarchive="1"');
  });
  it("서버 재오픈은 ARCHIVED 를 받는다 (구조 확인)", () => {
    const svc = read("lib/support/support-case-service.ts");
    const fn = svc.slice(svc.indexOf("export async function reopenSupportCase"));
    // 전체 수정 §2: 재오픈 = DB 전이 표(RESOLVED·ARCHIVED → OPEN · 이미 진행 중 = 변화 없음 ok)
    expect(fn.slice(0, 1500)).toContain('action: "reopen"');
    const mig = read("supabase/migrations/20271129100000_support_full_fix.sql");
    expect(mig).toMatch(/ELSIF p_action = 'reopen' THEN\s*IF v_active THEN/);
  });
});

describe("U-14 — 어드민 글 표시·답변 전송 중", () => {
  it("글 본문은 고객 화면과 같은 표시 함수를 거친다 (구조 확인)", () => {
    const src = read(PAGE);
    expect(src).toContain("resolveSupportMessageDisplayBody(safeT, m.body)");
    expect(src).not.toContain('<p className="whitespace-pre-wrap">{m.body}</p>');
  });
  it("답변 버튼은 보내는 동안 「보내는 중…」 (구조 확인)", () => {
    const src = read(PAGE);
    expect(src).toContain('? t("admin_support_sending")');
    expect(src).toContain("aria-busy={busy || undefined}");
    expect(translate("ko", "admin_support_sending")).toBe("보내는 중…");
    expect(translate("en", "admin_support_sending")).toBe("Sending…");
  });
});

describe("재감사 D1-b — 답을 쓰는 사이 고객 글이 더 왔다는 안내", () => {
  it("응답 값 → 안내 문구 (동작)", async () => {
    const { adminSupportErrorLabel } = await import("@/lib/support/support-display-labels");
    const safeT = (k: string) => translate("ko", k as MessageKey);
    expect(adminSupportErrorLabel(safeT as never, "reply_unseen_customer_messages")).toBe(
      "답을 쓰는 사이 고객 글이 더 왔어요. 아래에서 확인해 주세요."
    );
  });
  it("(구조 확인) patchCase 가 unseenCustomerMessages > 0 이면 안내를 띄운다", () => {
    const src = read(PAGE);
    expect(src).toContain('if (stillOpen && Number(json.unseenCustomerMessages ?? 0) > 0) setError("reply_unseen_customer_messages");');
  });
});
