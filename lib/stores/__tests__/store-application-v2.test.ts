/**
 * 매장 신청 v2 (Owner 「권장안으로 승인」 2026-11-10) — 진행 단계 · slug · 이름 규칙 · 오류 문구 표.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/stores/store-location-columns.server", () => ({ computeStoreLocationColumns: () => ({}) }));

import {
  resolveStoreApplicationPhase,
  resolveStoreApplicationStep,
  resolveStoreApplicationStepTimes,
} from "@/lib/stores/store-application-step";
import { makeStoreApplicationSlug } from "@/lib/stores/store-application-input.server";
import {
  composeStoreNameWithBranch,
  normalizeStoreApplyName,
  storeBaseNameWithoutBranch,
} from "@/lib/stores/store-application-limits";
import { storeApplicationErrorKey, storePhoneVerifyErrorKey } from "@/lib/stores/store-application-errors";
import { MESSAGES } from "@/lib/i18n/messages";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("진행 단계 — DB 값과 1:1", () => {
  it("상태 → 단계", () => {
    const states = (s: string, sales?: string, vis?: boolean) =>
      resolveStoreApplicationStep({ approval_status: s, sales_status: sales, is_visible: vis }).steps.map((x) => x.state);
    expect(states("pending")).toEqual(["done", "current", "todo", "todo", "todo", "todo"]);
    expect(states("under_review")).toEqual(["done", "done", "current", "todo", "todo", "todo"]);
    expect(states("revision_requested")).toEqual(["done", "done", "warn", "todo", "todo", "todo"]);
    expect(states("rejected")).toEqual(["done", "done", "bad", "todo", "todo", "todo"]);
    expect(states("approved", "pending", false)).toEqual(["done", "done", "done", "done", "current", "todo"]);
    expect(states("approved", "approved", false)).toEqual(["done", "done", "done", "done", "done", "current"]);
    expect(states("approved", "approved", true)).toEqual(["done", "done", "done", "done", "done", "done"]);
    expect(states("suspended")).toEqual(["done", "done", "done", "done", "done", "bad"]);
  });

  it("입점 승인만으로는 영업 시작이 아니다 (판매 승인·노출 별도)", () => {
    expect(resolveStoreApplicationPhase({ approval_status: "approved", sales_status: null, is_visible: true })).toBe(
      "approved_wait_sales"
    );
  });

  it("단계 시각 — 같은 상태 여러 번이면 최근, 심사 칸은 검토중·보완·반려 중 최근", () => {
    const times = resolveStoreApplicationStepTimes({
      created_at: "2026-11-10T01:00:00Z",
      approved_at: null,
      events: [
        { from_status: null, to_status: "pending", action: "submit", reason: null, actor_type: "owner", created_at: "2026-11-10T01:00:00Z" },
        { from_status: "pending", to_status: "under_review", action: "start_review", reason: null, actor_type: "admin", created_at: "2026-11-10T02:00:00Z" },
        { from_status: "under_review", to_status: "revision_requested", action: "request_revision", reason: "x", actor_type: "admin", created_at: "2026-11-10T03:00:00Z" },
        { from_status: "revision_requested", to_status: "pending", action: "resubmit", reason: null, actor_type: "owner", created_at: "2026-11-10T04:00:00Z" },
      ],
    });
    expect(times.received).toBe("2026-11-10T04:00:00Z");
    expect(times.review).toBe("2026-11-10T03:00:00Z");
  });
});

describe("매장 ID(slug) — 서버 자동 · 화면 미표시", () => {
  it("영문 이름은 이름 기반, 한글·짧은 이름은 s-코드, 재시도는 코드 붙임", () => {
    expect(makeStoreApplicationSlug("Mandoo House", 0)).toBe("mandoo-house");
    expect(makeStoreApplicationSlug("Mandoo House", 1)).toMatch(/^mandoo-house-[0-9a-f]{6}$/);
    expect(makeStoreApplicationSlug("만두네집", 0)).toMatch(/^s-[0-9a-f]{6}$/);
    expect(makeStoreApplicationSlug("Café Ñ", 0)).toBe("cafe-n");
    expect(makeStoreApplicationSlug("owner", 0)).toMatch(/^s-/);
  });

  it("신청 화면에 매장 ID 칸이 없다", () => {
    const form = read("components/business/BusinessApplyForm.tsx");
    expect(form).not.toContain("computedStoreSlug");
    expect(form).not.toContain("business_phase7_087");
  });
});

describe("매장 이름 · 지점명", () => {
  it("공백 정리 · 지점명 합치기 · 되돌리기", () => {
    expect(normalizeStoreApplyName("  Mandoo   House ")).toBe("Mandoo House");
    expect(composeStoreNameWithBranch("Mandoo House", " MOA ")).toBe("Mandoo House MOA");
    expect(storeBaseNameWithoutBranch("Mandoo House MOA", "MOA")).toBe("Mandoo House");
    expect(storeBaseNameWithoutBranch("Mandoo House", null)).toBe("Mandoo House");
  });
});

describe("오류 문구 표 — 서버 코드 원문 노출 금지", () => {
  it("알려진 코드는 문구 키, 모르는 코드는 일반 실패 문구", () => {
    expect(storeApplicationErrorKey("shopName_required")).toBe("store_apply_err_shop_name");
    expect(storeApplicationErrorKey("store_location_required")).toBe("store_apply_err_location");
    expect(storeApplicationErrorKey("something_new")).toBe("business_phase7_692");
    expect(storePhoneVerifyErrorKey("store_phone_otp_invalid")).toBe("store_apply_err_otp_invalid");
  });

  it("신청 화면은 json.error 원문을 화면에 쓰지 않는다", () => {
    const page = read("app/(main)/stores/owner/apply/page.tsx");
    expect(page).not.toMatch(/setSubmitError\(typeof json\?\.error === "string" \? json\.error/);
    expect(page).toContain("storeApplicationErrorKey");
  });

  it("새 문구 키는 ko·en 모두 있다", () => {
    const ko = MESSAGES.ko as Record<string, string>;
    const en = MESSAGES.en as Record<string, string>;
    for (const k of ["store_apply_step_sales", "store_apply_phone_sheet_title", "admin_store_app_phone_verified"]) {
      expect(ko[k]).toBeTruthy();
      expect(en[k]).toBeTruthy();
    }
  });
});

describe("회원 전화 인증과 분리", () => {
  it("매장 전화 인증 서비스는 회원 인증 표·profiles 를 건드리지 않는다", () => {
    const src = read("lib/stores/store-phone-otp-service.ts");
    expect(src).not.toContain("phone_otp_challenges");
    expect(src).not.toMatch(/from\("profiles"\)/);
    expect(src).toContain("store_phone_verifications");
  });

  it("프로필 일반 저장은 보완 재제출을 하지 않는다 (「보완 내용 제출」만)", () => {
    const core = read("lib/stores/owner-catalog/store-profile-core.server.ts");
    expect(core).not.toContain("ownerEditReturnsStoreToPending");
    expect(read("app/api/me/stores/[storeId]/resubmit/route.ts")).toContain('.eq("approval_status", "revision_requested")');
  });
});
