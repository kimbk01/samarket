/**
 * IN-N2 (2026-11-04) — 공통 광고 화면 인트로 카드가 Live 게시본 기간(예약됨·끝남·게시 중)을 반영.
 * 실제 GET 라우트를 Supabase 모의 클라이언트로 부르고, 카드 문구 함수로 화면 문구까지 확인한다.
 */
import "@/lib/i18n/admin-catalog"; // 어드민 문구 등록 — 이 시험은 어드민 문구를 검사한다 (전역 준비 파일에서 옮김, C3 2026-11-11)
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  live: { state: "active", publication_id: "pub-1" } as { state: string; publication_id: string | null } | null,
  eligibility: null as Record<string, unknown> | null,
  pubError: null as { message: string } | null,
}));

vi.mock("@/lib/admin/require-admin-api", () => ({ requireAdminApiUser: async () => ({ ok: true, userId: "admin-1" }) }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      for (const k of ["select", "eq", "or", "limit"]) q[k] = chain;
      q.maybeSingle = async () => {
        if (table === "launch_intro_live") return { data: h.live, error: null };
        if (table === "launch_intro_publications")
          return h.pubError ? { data: null, error: h.pubError } : { data: { eligibility: h.eligibility }, error: null };
        return { data: null, error: null };
      };
      q.then = (res: (v: unknown) => unknown) => res({ count: 0, error: null });
      return q;
    },
  }),
}));

const HOUR = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString();

async function getIntro() {
  const { GET } = await import("@/app/api/admin/advertising/other-surfaces/route");
  const res = await GET();
  const j = (await res.json()) as { ok: boolean; intro: { state: string; live: boolean; schedule: string | null } };
  expect(j.ok).toBe(true);
  return j.intro;
}

beforeEach(() => {
  h.live = { state: "active", publication_id: "pub-1" };
  h.eligibility = { frequency: "every_launch" };
  h.pubError = null;
});

describe("IN-N2 — 인트로 카드 기간 반영", () => {
  it("시작 전 → schedule=scheduled · live=false · 카드 「예약됨」", async () => {
    h.eligibility = { frequency: "every_launch", startAt: iso(Date.now() + 5 * HOUR) };
    const intro = await getIntro();
    expect(intro).toMatchObject({ state: "active", schedule: "scheduled", live: false });
    const { introCardStatusText } = await import("@/components/admin/ads/AdminAdsOtherSurfacesCards");
    expect(introCardStatusText(intro as never, true)).toBe("예약됨 · 시작 전이라 안 나옴");
  });

  it("종료 후 → schedule=ended · live=false · 카드 「끝남」", async () => {
    h.eligibility = { frequency: "every_launch", startAt: iso(Date.now() - 5 * HOUR), endAt: iso(Date.now() - HOUR) };
    const intro = await getIntro();
    expect(intro).toMatchObject({ schedule: "ended", live: false });
    const { introCardStatusText } = await import("@/components/admin/ads/AdminAdsOtherSurfacesCards");
    expect(introCardStatusText(intro as never, true)).toBe("끝남 · 기간이 지나 안 나옴");
  });

  it("기간 안 → running · live=true · 카드 「게시 중」 / 기간 없음 → always · 「게시 중」", async () => {
    const { introCardStatusText } = await import("@/components/admin/ads/AdminAdsOtherSurfacesCards");
    h.eligibility = { frequency: "every_launch", startAt: iso(Date.now() - HOUR), endAt: iso(Date.now() + HOUR) };
    let intro = await getIntro();
    expect(intro).toMatchObject({ schedule: "running", live: true });
    expect(introCardStatusText(intro as never, true)).toBe("게시 중");
    h.eligibility = { frequency: "every_launch" };
    intro = await getIntro();
    expect(intro).toMatchObject({ schedule: "always", live: true });
    expect(introCardStatusText(intro as never, true)).toBe("게시 중");
  });

  it("일시정지면 기간과 상관없이 「일시정지」 · 게시본 읽기 실패면 「기간 확인 못 함」(게시 중으로 단정 안 함)", async () => {
    const { introCardStatusText } = await import("@/components/admin/ads/AdminAdsOtherSurfacesCards");
    h.live = { state: "paused", publication_id: "pub-1" };
    h.eligibility = { frequency: "every_launch", endAt: iso(Date.now() - HOUR) };
    let intro = await getIntro();
    expect(intro.live).toBe(false);
    expect(introCardStatusText(intro as never, true)).toBe("일시정지");
    h.live = { state: "active", publication_id: "pub-1" };
    h.pubError = { message: "boom" };
    intro = await getIntro();
    expect(intro).toMatchObject({ schedule: null, live: false });
    expect(introCardStatusText(intro as never, true)).toBe("게시 중 · 기간 확인 못 함");
  });
});
