import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/** D3·D20 — 공개 프로필: 상세 주소 미노출 · @아이디 표시 · 탈퇴·차단 계정 404 */

function dto(partial: Partial<UserAddressDTO>): UserAddressDTO {
  return {
    id: "a1",
    userId: "u1",
    labelType: "home",
    linkedStoreId: null,
    nickname: null,
    recipientName: "Juan Dela Cruz",
    phoneNumber: "+639171234567",
    countryCode: "PH",
    countryName: "Philippines",
    province: "Metro Manila",
    cityMunicipality: "Makati City",
    barangay: "Poblacion",
    district: null,
    streetAddress: "123 Jupiter Street",
    buildingName: "Sunrise Tower",
    unitFloorRoom: "Unit 12B",
    landmark: "near 7-Eleven",
    latitude: 14.56,
    longitude: 121.03,
    placeId: "pid",
    formattedAddress: "Sunrise Tower, 123 Jupiter Street, Poblacion, Makati City",
    roadAddress: "123 Jupiter Street",
    detailAddress: "Unit 12B",
    deliveryNote: "gate code 1234",
    fullAddress: null,
    neighborhoodName: null,
    appRegionId: null,
    appCityId: null,
    useForLife: true,
    useForTrade: true,
    useForDelivery: true,
    isDefaultMaster: true,
    isDefaultLife: false,
    isDefaultTrade: false,
    isDefaultDelivery: false,
    isActive: true,
    sortOrder: 0,
    lastUsedAt: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

let profileRow: Record<string, unknown> | null;
const master = dto({});

function chain(result: () => { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = () => q;
  q.ilike = () => q;
  q.maybeSingle = async () => result();
  return q;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    from: (table: string) => {
      if (table === "profiles") return chain(() => ({ data: profileRow, error: null }));
      if (table === "member_trust_snapshots") return chain(() => ({ data: { manner_battery_percent: 72 }, error: null }));
      return chain(() => ({ data: null, error: null }));
    },
  }),
}));
vi.mock("@/lib/addresses/user-address-service", () => ({
  getUserAddressDefaults: async () => ({ master }),
}));

type PublicProfileJson = { ok?: boolean; profile: { tradeLocationLine?: string | null; username?: string | null } };

const SENSITIVE = ["Sunrise Tower", "Jupiter", "12B", "7-Eleven", "1234", "Juan", "+639"];

async function getById() {
  const { GET } = await import("@/app/api/users/[userId]/public-profile/route");
  const res = await GET({} as never, { params: Promise.resolve({ userId: "u1" }) });
  return { status: res.status, json: (await res.json()) as PublicProfileJson };
}

async function getByUsername() {
  const { GET } = await import("@/app/api/users/by-username/[username]/public-profile/route");
  const res = await GET({} as never, { params: Promise.resolve({ username: "juan01" }) });
  return { status: res.status, json: (await res.json()) as PublicProfileJson };
}

describe("public profile exposure", () => {
  beforeEach(() => {
    profileRow = {
      id: "u1",
      nickname: "Juan",
      display_name: "Juan",
      username: "juan01",
      dibay_id: "juan01",
      avatar_url: null,
      trust_score: 50,
      status: "verified_user",
      deleted_at: null,
    };
  });

  it.each([
    ["by id", getById],
    ["by username", getByUsername],
  ])("%s: 동네만 공개, 건물·도로·호수·연락처 미노출, @아이디 포함", async (_label, get) => {
    const r = await get();
    expect(r.status).toBe(200);
    const line = String(r.json.profile.tradeLocationLine ?? "");
    expect(line).toContain("Makati");
    for (const s of SENSITIVE) expect(JSON.stringify(r.json)).not.toContain(s === "Juan" ? "Juan Dela Cruz" : s);
    expect(r.json.profile.username).toBe("juan01");
  });

  it.each([
    ["탈퇴(deleted_at)", { deleted_at: "2026-10-01T00:00:00Z" }],
    ["탈퇴(status=deleted)", { status: "deleted" }],
    ["차단(status=blocked)", { status: "blocked" }],
  ])("%s 계정은 404", async (_label, patch) => {
    profileRow = { ...profileRow!, ...patch };
    expect((await getById()).status).toBe(404);
    expect((await getByUsername()).status).toBe(404);
  });

  it("이용 정지(suspended) 계정은 공개 프로필 유지 — 판매글 판매자 카드가 깨지지 않도록", async () => {
    profileRow = { ...profileRow!, status: "suspended" };
    expect((await getById()).status).toBe(200);
  });
});
