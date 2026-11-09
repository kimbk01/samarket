/**
 * 고객센터 문의 유형 「매장 입점 문의」(STORE_PARTNERSHIP) 계약 테스트 (Owner 2026-11-10).
 * - 대상 MEMBER 만, 회원 선택지에 노출
 * - 외부 화면이 이 유형을 미리 골라 열 수 있음 (buildMemberSupportContext + navigateToSupportCenter / SupportContextProvider)
 * - 어드민 분야 필터(SUPPORT_CATEGORY_GROUPS)에 포함
 * - 안내 시드: 무료 종료일을 박지 않고, 신청 경로 CTA 는 내부 경로
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MEMBER_SUPPORT_CATEGORIES,
  OWNER_SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_REGISTRY,
  getSupportCategoryDefinition,
  listIssueTypesForCategory,
  listSelectableSupportCategories,
  resolveCanonicalSupportCategoryId,
  validateSupportCategoryForOpen,
} from "@/lib/support/support-category-registry";
import { SUPPORT_CATEGORY_GROUPS } from "@/lib/support/support-category-groups";
import { buildMemberSupportContext, isSupportContextEnabled } from "@/lib/support/support-context";
import {
  buildTriageOpenContext,
  initSupportTriageFromContext,
  supportTriageReducer,
} from "@/lib/support/support-triage-model";
import { validateSupportGuidanceCta } from "@/lib/support/support-guidance-authority";
import { supportUiMessages } from "@/lib/i18n/catalog/support-ui";

const root = process.cwd();
const CAT = "STORE_PARTNERSHIP";

describe("STORE_PARTNERSHIP 매장 입점 문의 — 레지스트리", () => {
  it("MEMBER 전용 · 회원 선택지에 보이고 사장님 선택지에는 없다", () => {
    const def = getSupportCategoryDefinition(CAT);
    expect(def).not.toBeNull();
    expect(def!.audiences).toEqual(["MEMBER"]);
    expect(def!.selectable).toBe(true);
    expect(def!.canonicalId).toBeUndefined();
    expect(listSelectableSupportCategories("MEMBER").map((c) => c.id)).toContain(CAT);
    expect(listSelectableSupportCategories("OWNER").map((c) => c.id)).not.toContain(CAT);
    expect(MEMBER_SUPPORT_CATEGORIES).toContain(CAT);
    expect(OWNER_SUPPORT_CATEGORIES as readonly string[]).not.toContain(CAT);
    expect(resolveCanonicalSupportCategoryId(CAT, "MEMBER")).toBe(CAT);
    expect(resolveCanonicalSupportCategoryId(CAT, "OWNER")).toBeNull();
  });

  it("세부 유형 = 수수료·오픈 혜택 / 신청 방법·준비물 / 기타", () => {
    expect(listIssueTypesForCategory(CAT).map((i) => i.id)).toEqual(["FEE", "HOW_TO_APPLY", "OTHER"]);
    const ok = validateSupportCategoryForOpen({ audience: "MEMBER", category: CAT, issueType: "HOW_TO_APPLY" });
    expect(ok).toMatchObject({ ok: true, category: CAT, issueType: "HOW_TO_APPLY" });
    const owner = validateSupportCategoryForOpen({ audience: "OWNER", category: CAT, issueType: "FEE" });
    expect(owner.ok).toBe(false);
  });

  it("라벨 키가 ko·en 카탈로그에 모두 있다 (화면에 원시 키 노출 없음)", () => {
    const def = getSupportCategoryDefinition(CAT)!;
    const keys = [def.labelKey, def.adminLabelKey, ...def.issueTypes.map((i) => i.labelKey)];
    for (const k of keys) {
      expect((supportUiMessages.ko as Record<string, string>)[k], `ko ${k}`).toBeTruthy();
      expect((supportUiMessages.en as Record<string, string>)[k], `en ${k}`).toBeTruthy();
    }
    expect(supportUiMessages.ko.support_cat_store_partnership).toBe("매장 입점 문의");
    expect(supportUiMessages.en.support_cat_store_partnership).toBe("Store partnership inquiry");
  });
});

describe("STORE_PARTNERSHIP — 미리 선택해 열기", () => {
  it("buildMemberSupportContext({ category: STORE_PARTNERSHIP }) → 분야 고정·세부 유형 단계부터", () => {
    const ctx = buildMemberSupportContext({ enabled: true, category: CAT, sourceSurface: "delivery_home" });
    expect(isSupportContextEnabled(ctx)).toBe(true);
    let state = initSupportTriageFromContext(ctx);
    expect(state.step).toBe("START_ISSUE");
    expect(state.category).toBe(CAT);
    expect(state.categoryLocked).toBe(true);
    state = supportTriageReducer(state, { type: "SELECT_ISSUE", issueType: "FEE" });
    expect(state.step).toBe("GUIDANCE");
    expect(buildTriageOpenContext(state)).toMatchObject({ audience: "MEMBER", category: CAT });
  });

  it("일반 고객센터 진입에서도 분야로 고를 수 있다", () => {
    let state = initSupportTriageFromContext({
      enabled: true,
      audience: "MEMBER",
      category: "",
      sourceSurface: "mypage_customer_center",
      needsCategorySelection: true,
    });
    state = supportTriageReducer(state, { type: "SELECT_CATEGORY", categoryId: CAT });
    expect(state.category).toBe(CAT);
    expect(state.step).toBe("START_ISSUE");
  });
});

describe("어드민 분야 필터 (SUPPORT_CATEGORY_GROUPS)", () => {
  it("모든 레지스트리 유형은 정확히 1개 분야에 속한다 — 새 유형 포함", () => {
    for (const c of SUPPORT_CATEGORY_REGISTRY) {
      const hits = SUPPORT_CATEGORY_GROUPS.filter((g) => (g.categories as readonly string[]).includes(c.id));
      expect(hits.length, c.id).toBe(1);
    }
    const store = SUPPORT_CATEGORY_GROUPS.find((g) => g.id === "STORE")!;
    expect(store.categories as readonly string[]).toContain(CAT);
  });
});

describe("안내 시드 마이그레이션", () => {
  const dir = join(root, "supabase/migrations");
  const file = readdirSync(dir).find((f) => f.endsWith("_support_store_partnership_guidance_seed.sql"));
  const sql = file ? readFileSync(join(dir, file), "utf8") : "";

  it("FEE · HOW_TO_APPLY 두 안내를 재실행 안전하게 넣는다", () => {
    expect(file).toBeTruthy();
    expect(sql).toContain("'STORE_PARTNERSHIP'");
    expect(sql).toContain("'FEE'");
    expect(sql).toContain("'HOW_TO_APPLY'");
    expect(sql).toContain("WHERE NOT EXISTS");
  });

  it("무료 종료일을 문구에 박지 않고 배달 화면 안내로 연결 · 업종별 수수료 · 준비물 4가지", () => {
    // 주석(작성일·참조 파일명) 제외한 실제 SQL 에 날짜가 없어야 한다
    const body = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    expect(body).not.toMatch(/\d{4}[-.년/]\s?\d{1,2}/);
    expect(sql).toContain("배달 화면의 안내를 확인해 주세요");
    expect(sql).toContain("업종별 수수료");
    for (const item of ["전화번호 인증", "표시 이름", "대표 주소", "매장 업종"]) {
      expect(sql).toContain(item);
    }
  });

  it("신청 경로 CTA 는 내부 경로 /stores/owner/apply (CTA 검증 통과)", () => {
    expect(sql).toContain("'INTERNAL_ROUTE'");
    expect(sql).toContain("'/stores/owner/apply'");
    expect(validateSupportGuidanceCta("INTERNAL_ROUTE", "/stores/owner/apply").ok).toBe(true);
  });
});
