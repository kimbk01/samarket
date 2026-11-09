/**
 * 매장 입점·수수료 계약(서약) — 설계 v2 §4-5 (2026-11-10).
 * 서약 검사 · 승인 게이트(계약 필수 · 약관 게시 전 건너뜀 · 샘플 제외) · 무료 정책 호출이 승인 상태 변경보다 먼저 ·
 * 실패하면 승인 안 함 · 회원 재동의 비영향 · 마이그레이션 계약.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Call = { table: string; op: "select" | "update" | "insert" | "upsert" | "delete" | "rpc"; payload?: unknown };

/** 표·동작별 응답을 정하는 가짜 Supabase — 호출 순서를 기록한다 */
let calls: Call[];
let tables: Record<string, Row[]>;
let rpcResult: Record<string, { data: unknown; error: { message: string } | null }>;
let storeRow: Row;

function makeSb() {
  return {
    rpc: async (name: string, args: unknown) => {
      calls.push({ table: name, op: "rpc", payload: args });
      return rpcResult[name] ?? { data: null, error: { message: "no rpc" } };
    },
    from(table: string) {
      let op: Call["op"] = "select";
      let payload: unknown;
      const filters: Array<[string, unknown]> = [];
      const rows = () =>
        (tables[table] ?? []).filter((r) => filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return b;
        },
        in: (k: string, v: unknown[]) => {
          filters.push([k, v]);
          return b;
        },
        neq: () => b,
        order: () => b,
        limit: () => b,
        update: (p: Row) => {
          op = "update";
          payload = p;
          return b;
        },
        insert: (p: Row) => {
          op = "insert";
          payload = p;
          return b;
        },
        upsert: (p: Row) => {
          op = "upsert";
          payload = p;
          return b;
        },
        delete: () => {
          op = "delete";
          return b;
        },
        maybeSingle: async () => {
          calls.push({ table, op, payload });
          if (table === "stores" && op === "select") return { data: storeRow, error: null };
          return { data: rows()[0] ?? null, error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          calls.push({ table, op, payload });
          if (op === "update" && table === "stores") {
            resolve({ data: [{ id: storeRow.id }], error: null });
            return;
          }
          if (op !== "select") {
            resolve({ data: null, error: null });
            return;
          }
          resolve({ data: rows(), error: null });
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/delivery/launch/delivery-launch-settings.server", () => ({
  loadDeliveryLaunchSettingsCached: async () => ({ freeUntil: null }),
}));
vi.mock("@/lib/stores/delivery-menus/store-delivery-menu-guard.server", () => ({
  checkStoreDeliveryMenuBeforeExpose: async () => ({ ok: true }),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: vi.fn() }));
vi.mock("@/lib/stores/store-public-cache-invalidate-server", () => ({
  invalidateStorePublicCachesForSlugOnServer: vi.fn(),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: vi.fn(),
}));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));
vi.mock("@/lib/admin-business/admin-store-decision", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, safeNotifyOwnerStoreDecision: vi.fn(async () => undefined) };
});

import {
  activeFreeUntilOrNull,
  checkStorePartnerAgreementInput,
  parseStorePartnerAgreementInput,
  pickStorePartnerTermsForLocale,
  resolveLaunchFreeUntilForApproval,
  shouldCreateLaunchFreePolicy,
  storeHasAgreedToVersion,
  type StorePartnerTermsDocument,
} from "@/lib/stores/partner/store-partner-agreement-contract";
import { runApproveStorePartnerGate } from "@/lib/stores/partner/store-partner-agreement.server";
import { executeAdminStorePatchAction } from "@/lib/admin-business/execute-admin-store-patch-action.server";
import {
  adminPartnerAgreementRowMatches,
  buildAdminPartnerAgreementRow,
} from "@/lib/stores/partner/admin-store-partner-agreements-model";
import { APP_LEGAL_KINDS, isAppLegalKind } from "@/lib/legal/app-legal-documents";
import {
  evaluateLegalDocumentPatch,
  isPublishedTextFixedLegalKind,
  isRequiredConsentLegalKind,
  legalPublishNeedsConsentRequirement,
} from "@/lib/legal/app-legal-document-edit-policy";
import { resolveBusinessApplySubmitBlockedReason } from "@/lib/business/business-apply-submit-gate";

const TERMS: StorePartnerTermsDocument = { id: "doc-1", version: "1.0", locale: "ko", title: "T", body: "B" };
const NOW = new Date("2026-11-10T04:00:00Z"); // 2026-11-10 12:00 PHT

const agreementRow = (over: Row = {}): Row => ({
  id: "ag-1",
  store_id: "s1",
  owner_user_id: "owner-1",
  legal_document_id: "doc-1",
  document_version: "1.0",
  body_sha256: "a".repeat(64),
  locale: "ko",
  free_until: "2026-12-31",
  store_category_id: "cat-1",
  store_topic_id: "top-1",
  fee_percent_after: 7,
  source: "application",
  agreed_at: "2026-11-09T00:00:00Z",
  ...over,
});

beforeEach(() => {
  calls = [];
  tables = {};
  rpcResult = {
    admin_upsert_store_launch_free_policy: { data: { ok: true, result: "created", policy_id: "p1" }, error: null },
  };
  storeRow = { id: "s1", owner_user_id: "owner-1", approval_status: "pending", slug: "s-one", store_name: "S" };
});

describe("서약 입력 검사 (신청·재동의 공용)", () => {
  it("게시된 약관이 없으면 서약 없이 통과 (기존 흐름)", () => {
    expect(checkStorePartnerAgreementInput(null, null)).toEqual({ ok: true, required: false });
  });

  it("게시된 약관이 있으면 체크 2개 필수 → partner_agreement_required", () => {
    expect(checkStorePartnerAgreementInput(TERMS, null)).toEqual({ ok: false, error: "partner_agreement_required" });
    const half = parseStorePartnerAgreementInput({ documentId: "doc-1", version: "1.0", agreeTerms: true, agreeFee: false });
    expect(checkStorePartnerAgreementInput(TERMS, half)).toEqual({ ok: false, error: "partner_agreement_required" });
  });

  it("화면이 본 문서·버전이 지금 게시본과 다르면 partner_terms_version_mismatch", () => {
    const old = parseStorePartnerAgreementInput({ documentId: "doc-0", version: "0.9", agreeTerms: true, agreeFee: true });
    expect(checkStorePartnerAgreementInput(TERMS, old)).toEqual({ ok: false, error: "partner_terms_version_mismatch" });
    const ok = parseStorePartnerAgreementInput({ documentId: "doc-1", version: "1.0", agreeTerms: true, agreeFee: true, locale: "en" });
    expect(checkStorePartnerAgreementInput(TERMS, ok)).toMatchObject({ ok: true, required: true });
    expect(ok?.locale).toBe("en");
  });

  it("언어별 게시본 — ko 와 버전이 같을 때만 그 언어, 아니면 ko", () => {
    const en = { ...TERMS, id: "doc-en", locale: "en" as const };
    expect(pickStorePartnerTermsForLocale(TERMS, en)?.id).toBe("doc-en");
    expect(pickStorePartnerTermsForLocale(TERMS, { ...en, version: "0.9" })?.id).toBe("doc-1");
    expect(pickStorePartnerTermsForLocale(null, en)?.id).toBe("doc-en");
  });

  it("신청서 제출 버튼 — 서약 미완료면 마지막 사유 partner", () => {
    const base = { storeSlug: "abc", addressId: "a1", applicantName: "Kim" };
    expect(resolveBusinessApplySubmitBlockedReason({ ...base, partnerPledgePending: true })).toBe("partner");
    expect(resolveBusinessApplySubmitBlockedReason({ ...base, partnerPledgePending: false })).toBeNull();
    expect(resolveBusinessApplySubmitBlockedReason({ ...base, applicantName: "", partnerPledgePending: true })).toBe("name");
  });
});

describe("무료 종료일 (필리핀 날짜)", () => {
  it("어드민 수정값이 최신 동의보다 우선", () => {
    expect(resolveLaunchFreeUntilForApproval({ overrideFreeUntil: "2027-01-15", latestAgreementFreeUntil: "2026-12-31" })).toBe("2027-01-15");
    expect(resolveLaunchFreeUntilForApproval({ overrideFreeUntil: null, latestAgreementFreeUntil: "2026-12-31" })).toBe("2026-12-31");
    expect(resolveLaunchFreeUntilForApproval({ overrideFreeUntil: "bad", latestAgreementFreeUntil: null })).toBeNull();
  });

  it("오늘(PHT) 포함 이후만 정책 생성 · 지난 날짜는 기록·생성 안 함", () => {
    expect(shouldCreateLaunchFreePolicy("2026-11-10", NOW)).toBe(true);
    expect(shouldCreateLaunchFreePolicy("2026-11-09", NOW)).toBe(false);
    // 2026-11-09 23:30 UTC = 2026-11-10 07:30 PHT — 필리핀 날짜 기준
    expect(activeFreeUntilOrNull("2026-11-09", new Date("2026-11-09T23:30:00Z"))).toBeNull();
    expect(activeFreeUntilOrNull("2026-11-10", new Date("2026-11-09T23:30:00Z"))).toBe("2026-11-10");
  });

  it("재동의 필요 판정 — 현재 게시 버전에 동의 기록이 있는지", () => {
    expect(storeHasAgreedToVersion([{ documentVersion: "1.0" }], "1.0")).toBe(true);
    expect(storeHasAgreedToVersion([{ documentVersion: "1.0" }], "1.1")).toBe(false);
    expect(storeHasAgreedToVersion([], null)).toBe(true);
  });
});

describe("입점 승인 게이트 runApproveStorePartnerGate", () => {
  it("게시된 약관이 있는데 동의 기록이 없으면 409 partner_agreement_required · 무료 정책 호출 없음", async () => {
    tables.app_legal_documents = [{ id: "doc-1", kind: "store_partner_terms", status: "published" }];
    const r = await runApproveStorePartnerGate(makeSb() as never, { storeId: "s1", storeKind: "real", actorId: "a", now: NOW });
    expect(r).toEqual({ ok: false, status: 409, error: "partner_agreement_required" });
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
  });

  it("게시된 약관이 아예 없으면 검사를 건너뛰고 meta 로 알림", async () => {
    const r = await runApproveStorePartnerGate(makeSb() as never, { storeId: "s1", storeKind: "real", actorId: "a", now: NOW });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.meta.partner_terms_published).toBe(false);
      expect(r.meta.partner_agreement_count).toBe(0);
      expect(r.meta.launch_free_policy).toBeNull();
    }
  });

  it("샘플 매장은 계약·무료 정책 모두 건너뜀", async () => {
    tables.app_legal_documents = [{ id: "doc-1", kind: "store_partner_terms", status: "published" }];
    const r = await runApproveStorePartnerGate(makeSb() as never, { storeId: "s1", storeKind: "sample", actorId: "a", now: NOW });
    expect(r.ok && r.meta.skipped_non_real_store).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("무료 종료일이 남았으면 SQL 함수 호출 (어드민 수정값 우선) · 실패하면 500 launch_free_policy_failed", async () => {
    tables.app_legal_documents = [{ id: "doc-1", kind: "store_partner_terms", status: "published" }];
    tables.store_partner_agreements = [agreementRow()];
    tables.store_launch_free_overrides = [{ store_id: "s1", free_until: "2027-01-15", reason: "연장", updated_at: "x" }];
    const ok = await runApproveStorePartnerGate(makeSb() as never, { storeId: "s1", storeKind: "real", actorId: "adm", now: NOW });
    expect(ok.ok && ok.meta.launch_free_source).toBe("override");
    const rpc = calls.find((c) => c.op === "rpc");
    expect(rpc?.table).toBe("admin_upsert_store_launch_free_policy");
    expect(rpc?.payload).toEqual({ p_store_id: "s1", p_free_until: "2027-01-15", p_actor: "adm" });

    calls = [];
    rpcResult.admin_upsert_store_launch_free_policy = { data: null, error: { message: "boom" } };
    const bad = await runApproveStorePartnerGate(makeSb() as never, { storeId: "s1", storeKind: "real", actorId: "adm", now: NOW });
    expect(bad).toEqual({ ok: false, status: 500, error: "launch_free_policy_failed" });
  });

  it("무료 종료일이 지났으면 정책을 만들지 않고 승인 진행", async () => {
    tables.app_legal_documents = [{ id: "doc-1", kind: "store_partner_terms", status: "published" }];
    tables.store_partner_agreements = [agreementRow({ free_until: "2026-11-01" })];
    const r = await runApproveStorePartnerGate(makeSb() as never, { storeId: "s1", storeKind: "real", actorId: "a", now: NOW });
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.op === "rpc")).toBe(false);
  });
});

describe("approve_store 실행 — 무료 정책이 승인 상태 변경보다 먼저, 실패 시 승인 안 함", () => {
  const run = (body: Row) =>
    executeAdminStorePatchAction({
      id: "s1",
      body: body as never,
      actorId: "admin-9",
      requestMeta: { ip: null, userAgent: null },
    });

  it("동의 있음 + 무료 남음 → RPC 다음에 stores UPDATE, 응답 meta·감사 after 에 결과", async () => {
    tables.app_legal_documents = [{ id: "doc-1", kind: "store_partner_terms", status: "published" }];
    tables.store_partner_agreements = [agreementRow({ free_until: "2099-12-31" })];
    const res = await run({ action: "approve_store", reason: "승인합니다" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; meta?: { partner_gate?: { launch_free_policy?: { ok: boolean } } } };
    expect(json.ok).toBe(true);
    expect(json.meta?.partner_gate?.launch_free_policy?.ok).toBe(true);
    const rpcIdx = calls.findIndex((c) => c.op === "rpc");
    const updIdx = calls.findIndex((c) => c.table === "stores" && c.op === "update");
    expect(rpcIdx).toBeGreaterThanOrEqual(0);
    expect(updIdx).toBeGreaterThan(rpcIdx);
    const { appendAuditLog } = await import("@/lib/audit/append-audit-log");
    const last = vi.mocked(appendAuditLog).mock.calls.at(-1)?.[1] as { after_json?: Row } | undefined;
    expect(last?.after_json?.partner_gate).toBeTruthy();
  });

  it("동의 없음(약관 게시됨) → 409, stores UPDATE 없음", async () => {
    tables.app_legal_documents = [{ id: "doc-1", kind: "store_partner_terms", status: "published" }];
    const res = await run({ action: "approve_store", reason: "승인합니다" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error?: string }).error).toBe("partner_agreement_required");
    expect(calls.some((c) => c.table === "stores" && c.op === "update")).toBe(false);
  });

  it("무료 정책 실패 → 500 launch_free_policy_failed, stores UPDATE 없음", async () => {
    tables.app_legal_documents = [{ id: "doc-1", kind: "store_partner_terms", status: "published" }];
    tables.store_partner_agreements = [agreementRow({ free_until: "2099-12-31" })];
    rpcResult.admin_upsert_store_launch_free_policy = { data: { ok: false, error: "forbidden" }, error: null };
    const res = await run({ action: "approve_store", reason: "승인합니다" });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error?: string }).error).toBe("launch_free_policy_failed");
    expect(calls.some((c) => c.table === "stores" && c.op === "update")).toBe(false);
  });

  it("약관 게시 전 → 동의 없이 승인, meta.partner_terms_published=false", async () => {
    const res = await run({ action: "approve_store", reason: "승인합니다" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { meta?: { partner_gate?: { partner_terms_published?: boolean } } };
    expect(json.meta?.partner_gate?.partner_terms_published).toBe(false);
  });

  it("set_launch_free_until — 사유 필수 · 지난 날짜 거부 · 승인 매장이면 RPC 로 종료일 반영", async () => {
    expect((await run({ action: "set_launch_free_until", free_until: "2099-01-01" })).status).toBe(400);
    const past = await run({ action: "set_launch_free_until", free_until: "2000-01-01", reason: "변경" });
    expect(((await past.json()) as { error?: string }).error).toBe("launch_free_until_past");
    storeRow.approval_status = "approved";
    calls = [];
    const ok = await run({ action: "set_launch_free_until", free_until: "2099-01-01", reason: "연장 합의" });
    expect(ok.status).toBe(200);
    const upsertIdx = calls.findIndex((c) => c.table === "store_launch_free_overrides" && c.op === "upsert");
    const rpcIdx = calls.findIndex((c) => c.op === "rpc");
    expect(upsertIdx).toBeGreaterThanOrEqual(0);
    expect(rpcIdx).toBeGreaterThan(upsertIdx);
  });
});

describe("어드민 목록 규칙", () => {
  const store = { id: "s1", storeName: "S", ownerLabel: "o", approvalStatus: "pending", categoryName: "c", topicName: "t" };
  const ag = {
    id: "a",
    storeId: "s1",
    ownerUserId: "o",
    legalDocumentId: "d",
    documentVersion: "1.0",
    bodySha256: "x",
    locale: "ko" as const,
    freeUntil: "2099-01-01",
    storeCategoryId: null,
    storeTopicId: null,
    feePercentAfter: 7,
    source: "application" as const,
    agreedAt: "2026-11-09T00:00:00Z",
  };
  it("승인 전 + 무료 남음 = 「승인 시 생성」 · 정책 있으면 정책 · 승인 매장 정책 없음 = 없음", () => {
    expect(buildAdminPartnerAgreementRow({ store, agreements: [ag], overrideFreeUntil: null, launchPolicy: null, currentVersion: "1.0" }).launchPolicyState).toBe("on_approval");
    expect(buildAdminPartnerAgreementRow({ store, agreements: [ag], overrideFreeUntil: null, launchPolicy: { endsAt: "x" }, currentVersion: "1.0" }).launchPolicyState).toBe("policy");
    expect(buildAdminPartnerAgreementRow({ store: { ...store, approvalStatus: "approved" }, agreements: [ag], overrideFreeUntil: null, launchPolicy: null, currentVersion: "1.0" }).launchPolicyState).toBe("none");
  });
  it("재동의 필요 필터 = 승인 매장 중 현재 버전 미동의", () => {
    const row = buildAdminPartnerAgreementRow({ store: { ...store, approvalStatus: "approved" }, agreements: [ag], overrideFreeUntil: null, launchPolicy: null, currentVersion: "1.1" });
    expect(adminPartnerAgreementRowMatches(row, "reconsent")).toBe(true);
    expect(adminPartnerAgreementRowMatches(row, "pending")).toBe(false);
    const fresh = buildAdminPartnerAgreementRow({ store: { ...store, approvalStatus: "approved" }, agreements: [ag], overrideFreeUntil: null, launchPolicy: null, currentVersion: "1.0" });
    expect(adminPartnerAgreementRowMatches(fresh, "reconsent")).toBe(false);
  });
});

describe("회원 재동의·회원 화면 비영향", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

  it("새 종류는 법률 문서 종류지만 회원 필수 동의 종류가 아니다", () => {
    expect(APP_LEGAL_KINDS).toContain("store_partner_terms");
    expect(isAppLegalKind("store_partner_terms")).toBe(true);
    expect(isRequiredConsentLegalKind("store_partner_terms")).toBe(false);
    expect(legalPublishNeedsConsentRequirement("store_partner_terms", "ko")).toBe(false);
    expect(isPublishedTextFixedLegalKind("store_partner_terms")).toBe(true);
  });

  it("게시된 입점 약관 문구는 고정 (서명 원문 보존)", () => {
    const current = {
      id: "d",
      kind: "store_partner_terms" as const,
      locale: "ko" as const,
      title: "T",
      body: "B",
      version: "1.0",
      status: "published" as const,
      effective_at: null,
      published_at: "2026-11-10T00:00:00Z",
      created_at: "",
      updated_at: "",
    };
    const r = evaluateLegalDocumentPatch(current, { body: "B2", confirmNoReconsent: true });
    expect(r).toMatchObject({ ok: false, error: "published_text_immutable" });
  });

  it("회원 재동의 버전·회원가입 동의·내정보 정책 화면은 새 종류를 읽지 않는다", () => {
    for (const f of [
      "lib/legal/resolve-required-consent-versions.ts",
      "components/auth/AuthConsentForm.tsx",
      "components/mypage/settings/MyPolicyHub.tsx",
    ]) {
      expect(read(f)).not.toMatch(/store_partner/);
    }
  });

  it("마이그레이션 — 회원 재동의 함수 미변경 · 계약 기록 추가만 · 수수료 해석 함수 미변경", () => {
    const sql = read("supabase/migrations/20271110150000_store_partner_agreements.sql");
    expect(sql).toContain("CHECK (kind IN ('terms', 'privacy', 'marketing', 'store_partner_terms'))");
    expect(sql).not.toMatch(/FUNCTION public\.required_consent_versions/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.store_commission_resolve_policy/);
    expect(sql).not.toMatch(/store_commission_charge_order_internal/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.store_partner_agreements/);
    expect(sql).toMatch(/'store_partner_terms', 'ko'[\s\S]*'1\.0', 'draft'/);
    expect(sql).toMatch(/'store_partner_terms', 'en'[\s\S]*'1\.0', 'draft'/);
  });
});
