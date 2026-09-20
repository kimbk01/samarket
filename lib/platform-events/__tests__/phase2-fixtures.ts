/**
 * Local Phase 2 fixtures — no Production DB.
 */
export const PHASE2_EVENT_A_ACTIVE = {
  id: "00000000-0000-4000-8000-0000000000a1",
  title: "dibaY Grand Open",
  subtitle: "오픈 혜택을 확인하세요",
  heroImageUrl: "https://example.com/hero-a.jpg",
  heroImagePath: null,
  sections: [
    { type: "text", body: "그랜드 오픈 기념 혜택이 준비되어 있습니다." },
    { type: "benefit", title: "2,000원 할인", body: "최소주문 15,000원" },
  ],
  terms: "일부 지역에서는 이용이 제한될 수 있습니다.",
  status: "published",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-12-31T00:00:00.000Z",
  timezone: "Asia/Manila",
  ctaLabel: "매장 둘러보기",
  ctaType: "internal_page",
  ctaTarget: "/market",
  ctaExternalUrl: null,
  publishedAt: "2026-09-01T00:00:00.000Z",
  createdBy: null,
  updatedBy: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
} as const;

export const PHASE2_EVENT_B_ENDED = {
  ...PHASE2_EVENT_A_ACTIVE,
  id: "00000000-0000-4000-8000-0000000000b2",
  title: "Ended Relay",
  status: "published",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-01-31T00:00:00.000Z",
} as const;
