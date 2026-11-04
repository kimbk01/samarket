/**
 * 광고 표면 연동 I3 (Owner 「감사해서 구현해라」 2026-11-04) — 배너(피드·이벤트) lib·API 동작 시험.
 * FA-3 업로드 기하 · FA-6 시작 시각 재조회 · EV-1 이벤트 배너 업로드 · EV-2 히어로 대체 텍스트 · EV-3 히어로 순서
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { makeFakeSb, type Row } from "@/lib/ads/__tests__/helpers/fake-supabase-1104f";

const sbRef = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => sbRef.current }));
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" } }),
}));
vi.mock("@/lib/admin/audit/append-admin-route-audit", () => ({ appendAdminRouteAudit: async () => undefined }));
vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserIdStrict: async () => ({ ok: true, userId: "member-1" }),
}));

import {
  feedAdUploadRejectMessage,
  validateFeedAdUploadGeometry,
} from "@/lib/ads/feed-ad-upload-geometry";
import { feedAdPublicValidUntil } from "@/lib/ads/feed-ad-public-projection";
import { GET as activeGET } from "@/app/api/feed-ads/active/route";
import { POST as adminUploadPOST } from "@/app/api/admin/feed-ads/upload/route";
import { POST as memberUploadPOST } from "@/app/api/me/feed-ad-requests/upload/route";
import {
  compareEventHeroBannerRows,
  loadActiveEventHeroBanners,
} from "@/lib/platform-promotion-distribution/load-active-event-hero-banners";
import {
  eventBannerUploadErrorMessage,
  eventBannerUploadPurpose,
} from "@/lib/platform-promotion-distribution/event-banner-upload";

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function png(width: number, height: number): Promise<File> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 10, g: 120, b: 60 } } })
    .png()
    .toBuffer();
  return new File([new Uint8Array(buf)], "a.png", { type: "image/png" });
}

function storageSb() {
  const uploads: string[] = [];
  const sb = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example.com/${path}` } }),
      }),
    },
  };
  return { sb, uploads };
}

async function postUpload(
  handler: (req: NextRequest) => Promise<Response>,
  url: string,
  file: File,
  purpose?: string
) {
  const fd = new FormData();
  fd.set("file", file);
  if (purpose) fd.set("purpose", purpose);
  const res = await handler(new NextRequest(url, { method: "POST", body: fd }));
  return { status: res.status, j: (await res.json()) as Row };
}

describe("FA-3 피드 배너 업로드 기하 — 3:1 · 최소 1200×400", () => {
  it("판정 함수: 1200×400·1500×500 통과 / 1200×600 비율 / 900×300 크기 / 0 읽기 실패", () => {
    expect(validateFeedAdUploadGeometry({ width: 1200, height: 400 })).toEqual({ ok: true });
    expect(validateFeedAdUploadGeometry({ width: 1500, height: 500 })).toEqual({ ok: true });
    expect(validateFeedAdUploadGeometry({ width: 1200, height: 600 })).toEqual({ ok: false, error: "aspect_mismatch" });
    expect(validateFeedAdUploadGeometry({ width: 900, height: 300 })).toEqual({ ok: false, error: "below_min_pixels" });
    expect(validateFeedAdUploadGeometry({ width: 0, height: 0 })).toEqual({ ok: false, error: "invalid_dimensions" });
  });

  it("거부 문구는 한국어 · 코드값 없음", () => {
    for (const e of ["aspect_mismatch", "below_min_pixels", "invalid_dimensions", "image_decode_failed"] as const) {
      const m = feedAdUploadRejectMessage(e);
      expect(m).toMatch(/[가-힣]/);
      expect(m).not.toMatch(/aspect_mismatch|below_min|invalid_dimensions|decode/);
    }
    expect(feedAdUploadRejectMessage("aspect_mismatch")).toContain("3:1");
    expect(feedAdUploadRejectMessage("below_min_pixels")).toContain("1200×400");
  });

  beforeEach(() => {
    sbRef.current = storageSb().sb;
  });

  it("관리자 업로드: 2:1 이미지 거부(400 · 한국어 message) / 3:1 1200×400 통과", async () => {
    const bad = await postUpload(adminUploadPOST, "http://x/api/admin/feed-ads/upload", await png(1200, 600));
    expect(bad.status).toBe(400);
    expect(bad.j.error).toBe("aspect_mismatch");
    expect(String(bad.j.message)).toContain("3:1");
    const small = await postUpload(adminUploadPOST, "http://x/api/admin/feed-ads/upload", await png(900, 300));
    expect(small.j.error).toBe("below_min_pixels");
    const ok = await postUpload(adminUploadPOST, "http://x/api/admin/feed-ads/upload", await png(1200, 400));
    expect(ok.status).toBe(200);
    expect(String(ok.j.url)).toContain("_admin/feed-ads/");
  });

  it("마이 배너(purpose=mypage_banner)는 피드 비율 검사를 받지 않는다", async () => {
    const r = await postUpload(adminUploadPOST, "http://x/api/admin/feed-ads/upload", await png(200, 200), "mypage_banner");
    expect(r.status).toBe(200);
    expect(String(r.j.url)).toContain("_admin/mypage-banners/");
  });

  it("회원 신청 업로드도 같은 규칙", async () => {
    const bad = await postUpload(memberUploadPOST, "http://x/api/me/feed-ad-requests/upload", await png(1000, 1000));
    expect(bad.status).toBe(400);
    expect(bad.j.error).toBe("aspect_mismatch");
    expect(String(bad.j.message)).toMatch(/[가-힣]/);
    const ok = await postUpload(memberUploadPOST, "http://x/api/me/feed-ad-requests/upload", await png(1200, 400));
    expect(ok.status).toBe(200);
  });
});

describe("EV-1 이벤트 배너 업로드 — 위치별 비율 (인라인 3:1 · 히어로 39:16)", () => {
  beforeEach(() => {
    sbRef.current = storageSb().sb;
  });

  it("형태 → 업로드 목적", () => {
    expect(eventBannerUploadPurpose("INLINE_BANNER")).toBe("feed_ad");
    expect(eventBannerUploadPurpose("HERO_BANNER")).toBe("event_hero_banner");
  });

  it("히어로: 3:1 이미지는 거부 · 1560×640(39:16) 통과", async () => {
    const bad = await postUpload(
      adminUploadPOST,
      "http://x/api/admin/feed-ads/upload",
      await png(1200, 400),
      "event_hero_banner"
    );
    expect(bad.status).toBe(400);
    expect(bad.j.error).toBe("aspect_mismatch");
    expect(String(bad.j.message)).toContain("39:16");
    const ok = await postUpload(
      adminUploadPOST,
      "http://x/api/admin/feed-ads/upload",
      await png(1560, 640),
      "event_hero_banner"
    );
    expect(ok.status).toBe(200);
    expect(String(ok.j.url)).toContain("_admin/event-banners/hero/");
  });

  it("오류 문구: 서버 message 우선 · 코드값 노출 없음", () => {
    expect(eventBannerUploadErrorMessage({ error: "aspect_mismatch", message: "비율이 다릅니다", lang: "ko" })).toBe(
      "비율이 다릅니다"
    );
    for (const code of ["file_too_large", "invalid_type", "storage_bucket_missing", "network_error", undefined]) {
      const m = eventBannerUploadErrorMessage({ error: code, lang: "ko" });
      expect(m).toMatch(/[가-힣]/);
      if (code) expect(m).not.toContain(code);
    }
  });
});

describe("FA-6 시작 전 캠페인의 시작 시각도 재조회 시각(validUntil)에 들어간다", () => {
  it("함수: 끝 시각보다 이른 다음 시작 시각을 고른다 · 지난 값·없음은 무시", () => {
    const end = iso(5 * DAY);
    const start = iso(2 * HOUR);
    expect(feedAdPublicValidUntil([{ endAt: end }], NOW, start)).toBe(start);
    expect(feedAdPublicValidUntil([{ endAt: end }], NOW, iso(10 * DAY))).toBe(end);
    expect(feedAdPublicValidUntil([{ endAt: end }], NOW, iso(-HOUR))).toBe(end);
    expect(feedAdPublicValidUntil([], NOW, start)).toBe(start);
    expect(feedAdPublicValidUntil([{ endAt: end }], NOW)).toBe(end);
  });

  it("공개 API: 지금 노출 중(5일 뒤 끝) + 2시간 뒤 시작 예약 → validUntil = 2시간 뒤 · 예약 캠페인은 아직 안 보냄", async () => {
    const start = iso(2 * HOUR);
    const base = {
      domain: "trade",
      placement: "TRADE_HOME",
      status: "active",
      priority: 100,
      destination_type: "internal_page",
      destination_id: "",
      destination_url: "/market",
      source: "ADMIN_DIRECT",
      request_id: null,
      name: "",
    };
    const fake = makeFakeSb({
      feed_ad_campaigns: [
        { ...base, id: "c-now", start_at: iso(-DAY), end_at: iso(5 * DAY) },
        { ...base, id: "c-later", start_at: start, end_at: iso(6 * DAY) },
      ],
      feed_ad_creatives: ["c-now", "c-later"].map((c) => ({
        id: `cr-${c}`,
        campaign_id: c,
        sort_order: 1,
        image_url: "https://cdn.example.com/a.png",
        headline: "",
        is_active: true,
      })),
    });
    sbRef.current = fake.sb;
    const res = await activeGET(new NextRequest("http://x/api/feed-ads/active?domain=trade&placement=TRADE_HOME&pool=1"));
    const j = (await res.json()) as { campaigns: Row[]; validUntil: string | null };
    expect(j.campaigns.map((c) => c.id)).toEqual(["c-now"]);
    expect(j.validUntil).toBe(start);
  });
});

describe("EV-2 · EV-3 이벤트 히어로 — 대체 텍스트 · 순서 고정", () => {
  function sbWith(distributions: Row[], events: Row[]) {
    const from = (table: string) => {
      if (table === "platform_promotion_distributions") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: async () => ({ data: distributions, error: null }),
        };
        return chain;
      }
      if (table === "platform_events") return { select: () => ({ in: async () => ({ data: events, error: null }) }) };
      throw new Error(table);
    };
    return { from } as never;
  }
  const dist = (id: string, eventId: string, updated_at: string, headline = "") => ({
    id,
    content_type: "platform_event",
    content_id: eventId,
    channel: "banner",
    enabled: true,
    status: "active",
    channel_ref_type: null,
    channel_ref_id: null,
    created_at: "",
    updated_at,
    config: { presentation: "HERO_BANNER", placement: "TRADE_HOME", imageUrl: `https://x/${id}.png`, headline },
  });
  const ev = (id: string, title: string) => ({
    id,
    title,
    status: "published",
    starts_at: iso(-DAY),
    ends_at: iso(DAY),
  });

  it("같은 위치 여러 개 → 최근 수정 먼저 · 같으면 id 오름차순 (DB 응답 순서와 무관)", async () => {
    const items = await loadActiveEventHeroBanners(
      sbWith(
        [dist("d-b", "e1", iso(-2 * HOUR)), dist("d-c", "e1", iso(-HOUR)), dist("d-a", "e1", iso(-2 * HOUR))],
        [ev("e1", "가을 할인")]
      ),
      { placement: "TRADE_HOME" }
    );
    expect(items.map((i) => i.distributionId)).toEqual(["d-c", "d-a", "d-b"]);
    expect(compareEventHeroBannerRows({ id: "a", updatedAt: "" }, { id: "b", updatedAt: "" })).toBeLessThan(0);
  });

  it("문구가 비면 영어 「Event」 대신 이벤트 제목 · 문구가 있으면 그대로", async () => {
    const items = await loadActiveEventHeroBanners(
      sbWith([dist("d1", "e1", iso(-HOUR)), dist("d2", "e2", iso(-2 * HOUR), "직접 쓴 문구")], [
        ev("e1", "가을 할인"),
        ev("e2", "겨울 할인"),
      ]),
      { placement: "TRADE_HOME" }
    );
    expect(items.find((i) => i.distributionId === "d1")?.headline).toBe("가을 할인");
    expect(items.find((i) => i.distributionId === "d2")?.headline).toBe("직접 쓴 문구");
    expect(items.some((i) => i.headline === "Event")).toBe(false);
  });
});
