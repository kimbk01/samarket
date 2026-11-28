import "@/lib/i18n/admin-catalog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/**
 * 모임 R4 묶음 A — D-14(경고·차단 종료일 없음) · 정책값 3개를 운영 정책으로 (설계 docs/audit/moim-r4-decisions-design-2026-11-28.md §2-1·§3).
 * 문자열 대조가 아니라 라우트 응답·RPC 로 넘긴 값·순수 함수 결과를 본다.
 */

const { rpc, after } = vi.hoisted(() => ({
  rpc: {
    moimAdminSanctionApply: vi.fn(async (..._a: unknown[]) => ({ ok: true, sanction_id: "s1", notify_user_ids: [], name: "M" }) as Record<string, unknown>),
    moimAdminReportDecide: vi.fn(async (..._a: unknown[]) => ({ ok: true, moim_id: "m", status: "actioned", actions: [], reporter_ids: [] }) as Record<string, unknown>),
    moimAdminPoliciesSave: vi.fn(async (..._a: unknown[]) => ({ ok: true, updated_at: "2026-11-28T00:00:00Z" }) as Record<string, unknown>),
    moimReportCreate: vi.fn(async (..._a: unknown[]) => ({ ok: true, report_id: "r1" }) as Record<string, unknown>),
  },
  after: [] as unknown[],
}));

vi.mock("@/lib/moim/server/moim-rpc.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-rpc.server")>("@/lib/moim/server/moim-rpc.server");
  return {
    ...actual,
    moimAdminSanctionApply: (...a: unknown[]) => rpc.moimAdminSanctionApply(...a),
    moimAdminReportDecide: (...a: unknown[]) => rpc.moimAdminReportDecide(...a),
    moimAdminPoliciesSave: (...a: unknown[]) => rpc.moimAdminPoliciesSave(...a),
    moimReportCreate: (...a: unknown[]) => rpc.moimReportCreate(...a),
  };
});
vi.mock("@/lib/moim/server/moim-notify.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-notify.server")>("@/lib/moim/server/moim-notify.server");
  return { ...actual, notifyMoimAfterResponse: (w: unknown) => after.push(w), notifyMoimMany: async () => ({ failed: 0 }) };
});
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin", isSuperAdmin: true }, sb: {} }),
  requireSuperAdmin: async () => ({ ok: true, actor: { userId: "admin", isSuperAdmin: true }, sb: {} }),
}));
vi.mock("@/lib/admin/moim/moim-admin-queries.server", () => ({ loadAdminMoimPolicies: async () => ({ ok: true, policies: {} }) }));
vi.mock("@/lib/notifications/notify-community-moderation", () => ({ notifyCommunitySanction: async () => undefined }));
vi.mock("@/lib/admin-community-messenger/sync-room-after-admin-hide", () => ({ syncRoomAfterAdminMessageVisibility: async () => undefined }));
vi.mock("@/lib/moim/server/moim-route-guard.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moim/server/moim-route-guard.server")>("@/lib/moim/server/moim-route-guard.server");
  return { ...actual, guardMoimWrite: async () => ({ ok: true, userId: "u-me", sb: {} }) };
});
vi.mock("@/lib/security/rate-limit-presets", () => ({ enforceUserReportQuota: async () => ({ ok: true }) }));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => ({}) }));

import { POST as sanctionPost } from "@/app/api/admin/moim/moims/[moimId]/sanctions/route";
import { POST as decisionPost } from "@/app/api/admin/moim/reports/[reportId]/decision/route";
import { PUT as policiesPut } from "@/app/api/admin/moim/policies/route";
import { POST as reportPost } from "@/app/api/moim/[moimId]/reports/route";
import {
  MOIM_ADMIN_PERIOD_LEVELS,
  moimAdminLevelAllowsPeriod,
  parseMoimAdminPolicyRows,
  removedMoimReportReasonCodes,
} from "@/lib/admin/moim/moim-admin-contract";
import {
  MOIM_PROHIBITED_TYPE_CODES,
  MOIM_REPORT_REASON_CODES,
  activeMoimReportReasons,
  moimProhibitedTypeLabel,
  moimProhibitedTypesOrDefault,
  moimReportReasonLabel,
  parseMoimReportReasons,
} from "@/lib/moim/moim-report-reasons";
import { MOIM_ERROR_CODES } from "@/lib/moim/moim-error-codes";
import { moimErrorKey } from "@/lib/moim/moim-client-api";
import { moimPoliciesDraft, moimPoliciesPatch } from "@/components/admin/moim/AdminMoimPoliciesPage";
import { moimCreateProhibitedTypes } from "@/components/moim/MoimCreateWizard";
import { moimReportSheetReasons } from "@/components/moim/MoimReportSheet";

const MOIM = "11111111-1111-4111-8111-111111111111";
const REPORT = "33333333-3333-4333-8333-333333333333";
const TARGET = "44444444-4444-4444-8444-444444444444";
const req = (body: unknown, method = "POST") =>
  new Request("https://x.test/api", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
const FUTURE = "2099-01-01T23:59:59+08:00";
const ko = (k: MessageKey) => translate("ko", k);
const en = (k: MessageKey) => translate("en", k);

beforeEach(() => {
  vi.clearAllMocks();
  after.length = 0;
});

describe("D-14 경고·차단은 종료일 없음 — 라우트 400", () => {
  const sanction = (body: Record<string, unknown>) => sanctionPost(req({ reasonCode: "commercial", reason: "사유 확인", ...body }), { params: Promise.resolve({ moimId: MOIM }) });

  it("직접 제재: 경고·차단 + 끝나는 날 = 400 moim_sanction_period_not_allowed, RPC 를 부르지 않는다", async () => {
    for (const level of ["warn", "block"]) {
      const res = await sanction({ level, endsAt: FUTURE });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "moim_sanction_period_not_allowed" });
    }
    expect(rpc.moimAdminSanctionApply).not.toHaveBeenCalled();
  });

  it("직접 제재: 추천 제외 + 끝나는 날은 RPC 로 넘긴다 · 경고·차단도 날짜 없이는 넘긴다", async () => {
    expect((await sanction({ level: "unlist", endsAt: FUTURE })).status).toBe(200);
    expect(rpc.moimAdminSanctionApply.mock.calls[0][2]).toMatchObject({ level: "unlist", endsAt: new Date(FUTURE).toISOString() });
    expect((await sanction({ level: "block" })).status).toBe(200);
    expect(rpc.moimAdminSanctionApply.mock.calls[1][2]).toMatchObject({ level: "block", endsAt: null });
  });

  it("직접 제재 사유 코드는 형식만 본다 — 정책에 추가한 새 코드는 RPC 가 판정, 형식이 틀리면 400", async () => {
    expect((await sanction({ level: "warn", reasonCode: "new_reason" })).status).toBe(200);
    expect(rpc.moimAdminSanctionApply.mock.calls[0][2]).toMatchObject({ reasonCode: "new_reason" });
    const bad = await sanction({ level: "warn", reasonCode: "Bad-Code" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ ok: false, error: "moim_report_reason_invalid" });
  });

  const decide = (body: Record<string, unknown>) =>
    decisionPost(req({ expectedStatus: "received", decision: "actioned", reason: "사유 확인", ...body }), { params: Promise.resolve({ reportId: REPORT }) });

  it("신고 처리: 경고·차단 + 끝나는 날 = 400 moim_sanction_period_not_allowed", async () => {
    for (const moimLevel of ["warn", "block"]) {
      const res = await decide({ moimLevel, moimEndsAt: FUTURE });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "moim_sanction_period_not_allowed" });
    }
    expect(rpc.moimAdminReportDecide).not.toHaveBeenCalled();
  });

  it("신고 처리: 추천 제외 + 끝나는 날은 넘긴다 · 단계 없이 날짜만이면 기존대로 moim_sanction_period_invalid", async () => {
    expect((await decide({ moimLevel: "unlist", moimEndsAt: FUTURE })).status).toBe(200);
    expect(rpc.moimAdminReportDecide.mock.calls[0][2]).toMatchObject({ moimLevel: "unlist", moimEndsAt: new Date(FUTURE).toISOString() });
    const res = await decide({ contentHide: true, moimEndsAt: FUTURE });
    expect(await res.json()).toEqual({ ok: false, error: "moim_sanction_period_invalid" });
  });

  it("계약: 기간을 줄 수 있는 단계 = 추천 제외만", () => {
    expect(MOIM_ADMIN_PERIOD_LEVELS).toEqual(["unlist"]);
    expect(moimAdminLevelAllowsPeriod("unlist")).toBe(true);
    expect(moimAdminLevelAllowsPeriod("warn")).toBe(false);
    expect(moimAdminLevelAllowsPeriod("block")).toBe(false);
    expect(moimAdminLevelAllowsPeriod(null)).toBe(false);
  });

  it("새 오류 코드는 등록돼 있고 ko·en 문구가 있다", () => {
    for (const code of ["moim_sanction_period_not_allowed", "moim_policy_report_reason_removed"] as const) {
      expect(MOIM_ERROR_CODES).toContain(code);
      const key = moimErrorKey(code);
      expect(key).toBe(`moim_err_${code}`);
      expect(ko(key)).not.toBe("");
      expect(en(key)).not.toBe("");
    }
    expect(en("admin_moim_field_ends_at_none")).toBe("Stays until an admin lifts it");
    expect(ko("admin_moim_field_ends_at_none")).toBe("어드민이 해제할 때까지 이어져요");
  });
});

describe("§3 사용자 신고 라우트 — 사유 코드는 형식만", () => {
  const report = (reasonCode: unknown) =>
    reportPost(req({ targetType: "post", targetId: TARGET, reasonCode }), { params: Promise.resolve({ moimId: MOIM }) });
  it("정책에 추가한 코드는 RPC 로 넘기고(목록 판정은 RPC), 형식이 틀리면 400", async () => {
    expect((await report("new_reason")).status).toBe(200);
    expect(rpc.moimReportCreate.mock.calls[0][2]).toMatchObject({ reasonCode: "new_reason" });
    for (const bad of ["A", "x", "has space", 3, null]) expect((await report(bad)).status).toBe(400);
    expect(rpc.moimReportCreate).toHaveBeenCalledTimes(1);
  });
});

describe("§3 정책 저장 라우트 — 새 키 3개", () => {
  const put = (patch: Record<string, unknown>) => policiesPut(req({ patch, expectedUpdatedAt: "2026-11-28T00:00:00Z", reason: "정책 변경" }, "PUT"));
  const sentPatch = () => rpc.moimAdminPoliciesSave.mock.calls[0][1] as Record<string, unknown>;

  it("가입 질문 금지어: 공백 제거·중복 제거 후 넘긴다 · 500개 넘거나 40자 넘으면 400", async () => {
    expect((await put({ question_banned_words: [" 연락처 ", "연락처", "", "kakao id"] })).status).toBe(200);
    expect(sentPatch()).toEqual({ question_banned_words: ["연락처", "kakao id"] });
    expect((await put({ question_banned_words: Array.from({ length: 501 }, (_, i) => `w${i}`) })).status).toBe(400);
    expect((await put({ question_banned_words: ["a".repeat(41)] })).status).toBe(400);
    expect((await put({ question_banned_words: "연락처" })).status).toBe(400);
  });

  it("금지 모임 유형: 맞는 줄은 넘기고, 코드 형식·겹침·한국어 이름 없음·20개 초과는 400 moim_policy_invalid", async () => {
    const ok = [{ code: "commercial", label_ko: " 영리 모임 ", label_en: "Selling" }, { code: "gambling", label_ko: "도박 모임" }];
    expect((await put({ prohibited_types: ok })).status).toBe(200);
    expect(sentPatch()).toEqual({
      prohibited_types: [
        { code: "commercial", label_ko: "영리 모임", label_en: "Selling" },
        { code: "gambling", label_ko: "도박 모임", label_en: "" },
      ],
    });
    const bads = [
      [{ code: "Bad", label_ko: "x" }],
      [{ code: "dup", label_ko: "x" }, { code: "dup", label_ko: "y" }],
      [{ code: "nolabel", label_ko: " " }],
      [{ code: "toolong", label_ko: "가".repeat(81) }],
      Array.from({ length: 21 }, (_, i) => ({ code: `t_${String.fromCharCode(97 + (i % 26))}${"a".repeat(Math.floor(i / 26) + 1)}`, label_ko: "x" })),
    ];
    for (const b of bads) {
      const res = await put({ prohibited_types: b });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "moim_policy_invalid" });
    }
  });

  it("신고 사유: is_active 가 boolean 이 아니면 400, 맞으면 is_active 까지 넘긴다(없으면 켜짐)", async () => {
    expect((await put({ report_reasons: [{ code: "spam_ads", label_ko: "광고", label_en: "Ads", is_active: "yes" }] })).status).toBe(400);
    expect((await put({ report_reasons: [{ code: "spam_ads", label_ko: "광고" }, { code: "other", label_ko: "기타", is_active: false }] })).status).toBe(200);
    expect(sentPatch()).toEqual({
      report_reasons: [
        { code: "spam_ads", label_ko: "광고", label_en: "", is_active: true },
        { code: "other", label_ko: "기타", label_en: "", is_active: false },
      ],
    });
  });

  it("계약 함수: 저장된 신고 사유에서 빠진 코드를 찾는다", () => {
    expect(removedMoimReportReasonCodes([{ code: "a_a" }, { code: "b_b" }], [{ code: "b_b" }])).toEqual(["a_a"]);
    expect(removedMoimReportReasonCodes(null, [])).toEqual([]);
    expect(parseMoimAdminPolicyRows([{ code: "ok_code", label_ko: "이름", label_en: 3 }], "prohibited_types")).toBeNull();
  });
});

describe("§3 정책 화면 — 바뀐 값만 저장 요청으로", () => {
  const row = {
    updated_at: "t",
    banned_words: ["a"],
    question_banned_words: ["연락처"],
    prohibited_types: [{ code: "commercial", label_ko: "영리", label_en: "Selling" }],
    report_reasons: [{ code: "other", label_ko: "기타", label_en: "Other", is_active: true }],
  };
  it("아무것도 안 바꾸면 빈 요청 · 신고 사유를 끄면 report_reasons 만", () => {
    const base = moimPoliciesDraft(row);
    expect(moimPoliciesPatch(moimPoliciesDraft(row), base)).toEqual({});
    const draft = moimPoliciesDraft(row);
    draft.reasons = draft.reasons!.map((r) => ({ ...r, active: false }));
    expect(moimPoliciesPatch(draft, base)).toEqual({ report_reasons: [{ code: "other", label_ko: "기타", label_en: "Other", is_active: false }] });
  });
  it("새 열이 없는 옛 DB 면 그 항목을 요청에 넣지 않는다", () => {
    const old = { updated_at: "t", banned_words: [] };
    const d = moimPoliciesDraft(old);
    expect(d.question).toBeNull();
    expect(d.types).toBeNull();
    expect(d.reasons).toBeNull();
    expect(moimPoliciesPatch(d, moimPoliciesDraft(old))).toEqual({});
  });
  it("가입 질문 금지어를 바꾸면 question_banned_words 로 보낸다", () => {
    const d = moimPoliciesDraft(row);
    d.question = "연락처\n본명";
    expect(moimPoliciesPatch(d, moimPoliciesDraft(row))).toEqual({ question_banned_words: ["연락처", "본명"] });
  });
});

describe("§3 표시 이름 — 정책 데이터 → 기존 키 → 코드", () => {
  const tKo = (k: MessageKey) => ko(k);
  const tEn = (k: MessageKey) => en(k);
  it("신고 사유: 데이터 이름을 앱 언어로 쓰고, 영어가 비면 기본 코드는 기존 키, 새 코드는 코드", () => {
    const items = [
      { code: "commercial", labelKo: "광고 모임", labelEn: "Ads group" },
      { code: "fraud", labelKo: "사기", labelEn: "" },
      { code: "new_reason", labelKo: "새 사유", labelEn: "" },
    ];
    expect(moimReportReasonLabel("ko", tKo, "commercial", items)).toBe("광고 모임");
    expect(moimReportReasonLabel("en", tEn, "commercial", items)).toBe("Ads group");
    expect(moimReportReasonLabel("en", tEn, "fraud", items)).toBe(en("moim_report_reason_fraud"));
    expect(moimReportReasonLabel("en", tEn, "new_reason", items)).toBe("new_reason");
    expect(moimReportReasonLabel("ko", tKo, "new_reason", items)).toBe("새 사유");
    /** 정책 목록을 모를 때(불러오는 중·옛 DB) = 기존 키 */
    expect(moimReportReasonLabel("ko", tKo, "dating", null)).toBe(ko("moim_report_reason_dating"));
    expect(moimReportReasonLabel("ko", tKo, "zzz_unknown", null)).toBe("zzz_unknown");
  });

  it("금지 유형: 데이터 이름 → 기존 moim_rule_ 키 → 코드", () => {
    expect(moimProhibitedTypeLabel("en", tEn, { code: "mlm", labelKo: "다단계", labelEn: "" })).toBe(en("moim_rule_mlm"));
    expect(moimProhibitedTypeLabel("ko", tKo, { code: "mlm", labelKo: "다단계 모임", labelEn: "" })).toBe("다단계 모임");
    expect(moimProhibitedTypeLabel("en", tEn, { code: "gambling", labelKo: "도박", labelEn: "" })).toBe("gambling");
  });

  it("기본값: 정책이 없으면 신고 사유 12개 · 금지 유형 8개 (기존 키가 모두 ko·en 에 있다)", () => {
    expect(activeMoimReportReasons(null).map((r) => r.code)).toEqual([...MOIM_REPORT_REASON_CODES]);
    expect(moimProhibitedTypesOrDefault(undefined).map((r) => r.code)).toEqual([...MOIM_PROHIBITED_TYPE_CODES]);
    for (const c of MOIM_REPORT_REASON_CODES) expect(en(`moim_report_reason_${c}` as MessageKey)).not.toBe("");
    for (const c of MOIM_PROHIBITED_TYPE_CODES) expect(ko(`moim_rule_${c}` as MessageKey)).not.toBe("");
  });

  it("신고 시트: 켜진 사유만, 상세에 목록이 없으면 기본 12개", () => {
    const reasons = parseMoimReportReasons([
      { code: "commercial", label_ko: "광고", label_en: "Ads", is_active: true },
      { code: "other", label_ko: "기타", label_en: "Other", is_active: false },
      { code: "Bad", label_ko: "x" },
    ]);
    expect(reasons?.map((r) => [r.code, r.isActive])).toEqual([
      ["commercial", true],
      ["other", false],
    ]);
    expect(moimReportSheetReasons(activeMoimReportReasons(reasons)).map((r) => r.code)).toEqual(["commercial"]);
    expect(moimReportSheetReasons(null)).toHaveLength(12);
    expect(parseMoimReportReasons("not array")).toBeNull();
  });

  it("만들기 화면: limits.prohibitedTypes 가 있으면 그 목록, 없으면 기본 8개", () => {
    expect(moimCreateProhibitedTypes({ prohibitedTypes: [{ code: "gambling", labelKo: "도박", labelEn: "Gambling" }] }).map((r) => r.code)).toEqual(["gambling"]);
    expect(moimCreateProhibitedTypes({})).toHaveLength(8);
  });
});

describe("§3 정책 공유 캐시 — 글자 수·금지 유형·신고 사유를 1행 한 번으로", () => {
  function fakeSb(row: Record<string, unknown>, failNewCols = false) {
    const calls: string[] = [];
    const sb = {
      from: (table: string) => ({
        select: (cols: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              calls.push(`${table}:${cols}`);
              if (failNewCols && cols.includes("report_reasons")) return { data: null, error: { message: "column does not exist" } };
              return { data: row, error: null };
            },
          }),
        }),
      }),
    };
    return { sb: sb as never, calls };
  }

  it("한 번 읽고 limits.prohibitedTypes·신고 사유를 함께 돌려준다 (5분 안 재호출 = 요청 없음)", async () => {
    const q = await import("@/lib/moim/server/moim-queries.server");
    q.__resetMoimTextLimitsCacheForTests();
    const { sb, calls } = fakeSb({
      name_min_len: 2,
      name_max_len: 30,
      intro_min_len: 10,
      intro_max_len: 1000,
      prohibited_types: [{ code: "commercial", label_ko: "영리", label_en: "Selling" }],
      report_reasons: [{ code: "other", label_ko: "기타", label_en: "Other", is_active: false }],
    });
    const [limits, reasons] = await Promise.all([q.loadMoimTextLimits(sb), q.loadMoimReportReasons(sb)]);
    expect(limits).toEqual({ nameMin: 2, nameMax: 30, introMin: 10, introMax: 1000, prohibitedTypes: [{ code: "commercial", labelKo: "영리", labelEn: "Selling" }] });
    expect(reasons).toEqual([{ code: "other", labelKo: "기타", labelEn: "Other", isActive: false }]);
    await q.loadMoimTextLimits(sb);
    expect(calls).toHaveLength(1);
  });

  it("새 열이 없는 옛 DB 면 예전 열로 다시 읽어 글자 수 정책은 지킨다 (금지 유형·신고 사유 = 없음 → 화면 기본값)", async () => {
    const q = await import("@/lib/moim/server/moim-queries.server");
    q.__resetMoimTextLimitsCacheForTests();
    const { sb, calls } = fakeSb({ name_min_len: 2, name_max_len: 30, intro_min_len: 10, intro_max_len: 1000 }, true);
    expect(await q.loadMoimTextLimits(sb)).toEqual({ nameMin: 2, nameMax: 30, introMin: 10, introMax: 1000 });
    expect(await q.loadMoimReportReasons(sb)).toBeNull();
    expect(calls).toHaveLength(2);
    q.__resetMoimTextLimitsCacheForTests();
  });
});
