/**
 * POST /api/me/stores (매장 신청) — 묶음 4 O-01 + 매장 신청 v2 (Owner 2026-11-10).
 * - 신청자 닉네임 필수 수집: 컬럼 부재 오류면 503 applicant_nickname_save_failed (재시도 없음).
 * - 매장 전화 = 매장 전용 인증 기록으로만 · 실제 영업장 위치 필수 · 매장 이름 중복은 지점명 · slug 자동.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let inserts: Row[];
let insertResults: Array<{ data: Row | null; error: { code?: string; message: string } | null }>;
let dupRows: Row[];
const consume = vi.fn();
const release = vi.fn();
const appendEvent = vi.fn();
const notifyAdmins = vi.fn();

function makeSb() {
  return {
    rpc: async () => ({ data: dupRows, error: null }),
    from(table: string) {
      let inserting = false;
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        neq: () => b,
        /** 입점 약관 게시본 조회(app_legal_documents · 5단계) — 게시본 없음 = 서약 없이 기존 흐름 */
        order: () => b,
        limit: async () => ({ data: [], error: null }),
        insert: (row: Row) => {
          inserting = true;
          inserts.push({ ...row });
          return b;
        },
        maybeSingle: async () => {
          if (inserting) return insertResults.shift() ?? { data: { id: "new-store" }, error: null };
          if (table === "store_categories") return { data: { id: "cat-1", name: "음식", slug: "food" }, error: null };
          if (table === "store_topics") return { data: { id: "top-1", name: "한식", slug: "korean" }, error: null };
          return { data: null, error: null };
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "user-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({
  loadMeStoresListForUser: vi.fn(),
  invalidateMeStoresListServerCache: vi.fn(),
}));
vi.mock("@/lib/addresses/user-address-service", () => ({
  getUserAddressDefaults: async () => ({ master: { id: "addr-1" } }),
}));
vi.mock("@/lib/addresses/address-book-card-presentation", () => ({
  formatAddressBookCardPresentation: () => ({ label: "Home" }),
}));
vi.mock("@/lib/stores/store-phone-otp-service", () => ({
  consumeStorePhoneVerification: (...a: unknown[]) => consume(...a),
  releaseStorePhoneVerification: (...a: unknown[]) => release(...a),
  isStorePhoneUsedByOtherStore: async () => ({ ok: true, data: false }),
  linkStorePhoneVerificationToStore: vi.fn(),
}));
vi.mock("@/lib/stores/store-application-events.server", () => ({
  appendStoreApplicationEvent: (...a: unknown[]) => appendEvent(...a),
}));
vi.mock("@/lib/stores/store-application-admin-notify.server", () => ({
  notifyAdminsStoreApplicationSubmitted: (...a: unknown[]) => notifyAdmins(...a),
}));

import { POST } from "@/app/api/me/stores/route";

const LOCATION = {
  lat: 14.535,
  lng: 120.982,
  formattedAddress: "Seaside Blvd, Pasay, Metro Manila",
  placeId: null,
  region: "Metro Manila",
  city: "Pasay",
  street: "Seaside Blvd",
  detail: "G/F Unit 3",
};

const req = (over: Row = {}) =>
  new Request("http://localhost/api/me/stores", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      applicantNickname: "사장님",
      shopName: "Mandoo House",
      categoryPrimarySlug: "food",
      categorySubSlug: "korean",
      phoneVerificationId: "pv-1",
      location: LOCATION,
      ...over,
    }),
  }) as never;

beforeEach(() => {
  inserts = [];
  insertResults = [];
  dupRows = [];
  consume.mockReset();
  release.mockReset();
  appendEvent.mockReset();
  notifyAdmins.mockReset();
  consume.mockResolvedValue({
    ok: true,
    data: { verificationId: "pv-1", phoneDb09: "09171234567", verifiedAt: "2026-11-10T05:00:00Z" },
  });
});

describe("O-01 / 매장 신청 v2 — POST /api/me/stores", () => {
  it("정상: 닉네임·인증 번호·위치·자동 slug 저장, 접수 기록·관리자 알림", async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(inserts).toHaveLength(1);
    const row = inserts[0]!;
    expect(row.applicant_nickname).toBe("사장님");
    expect(row.phone).toBe("09171234567");
    expect(row.phone_verified_at).toBe("2026-11-10T05:00:00Z");
    expect(row.phone_verification_id).toBe("pv-1");
    expect(row.slug).toBe("mandoo-house");
    expect(row.lat).toBe(14.535);
    expect(row.formatted_address).toBe(LOCATION.formattedAddress);
    expect(row.address_line2).toBe("G/F Unit 3");
    expect(row.approval_status).toBe("pending");
    expect(appendEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "submit", toStatus: "pending" }));
    expect(notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it("화면이 보낸 번호 문자열은 무시 — 인증 기록이 없으면 400, 저장 없음", async () => {
    consume.mockResolvedValue({ ok: false, status: 400, code: "store_phone_verification_required" });
    const res = await POST(req({ phone: "09990000000", phoneVerificationId: "" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("store_phone_verification_required");
    expect(inserts).toHaveLength(0);
  });

  it("매장 위치(지도 좌표) 없으면 400 store_location_required", async () => {
    const res = await POST(req({ location: null }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("store_location_required");
    expect(consume).not.toHaveBeenCalled();
  });

  it("같은 이름 매장이 있고 지점명이 없으면 409, 지점명이 있으면 「이름 지점명」 으로 저장", async () => {
    dupRows = [{ id: "s9", store_name: "Mandoo House", branch_name: null, approval_status: "approved" }];
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("store_name_duplicate_branch_required");

    const res2 = await POST(req({ branchName: "MOA" }));
    expect(res2.status).toBe(200);
    expect(inserts.at(-1)!.store_name).toBe("Mandoo House MOA");
    expect(inserts.at(-1)!.branch_name).toBe("MOA");
  });

  it("한글 매장 이름은 짧은 코드 slug (화면 미표시)", async () => {
    await POST(req({ shopName: "만두네집" }));
    expect(String(inserts[0]!.slug)).toMatch(/^s-[0-9a-f]{6}$/);
  });

  it("컬럼 부재 오류 → 재시도 없이 503 applicant_nickname_save_failed, 인증 사용 되돌림", async () => {
    insertResults = [
      {
        data: null,
        error: { code: "PGRST204", message: "Could not find the 'applicant_nickname' column of 'stores' in the schema cache" },
      },
    ];
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("applicant_nickname_save_failed");
    expect(inserts).toHaveLength(1);
    expect(release).toHaveBeenCalledWith(expect.anything(), "pv-1");
  });
});
