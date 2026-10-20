import type { MyPageBannerRow } from "@/lib/my/types";

/**
 * `GET /api/me/mypage-summary` 응답 계약 (최종 설계 §2.2) — 서버·클라 공용 타입.
 * - `unavailable` = 그 필드 계산 실패·시간 초과 → 화면은 비움(포인트만 "—").
 * - `hidden` = 목적지에 해당 숫자가 아직 없음 → 값 슬롯 자체 없음.
 * - 어떤 실패도 0 으로 바꾸지 않는다.
 */
export type MypageSummaryField<T> =
  | { status: "ok"; value: T }
  | { status: "unavailable" }
  | { status: "hidden" };

export type MypageSummaryTrust = {
  trust_score: number | null;
  manner_score: number | null;
};

export type MypageSummaryFields = {
  salesActiveCount: MypageSummaryField<number>;
  favoritesCount: MypageSummaryField<number>;
  offersReceivedPending: MypageSummaryField<number>;
  communityPostsCount: MypageSummaryField<number>;
  storeOrdersActiveCount: MypageSummaryField<number>;
  /** 음수 허용 */
  pointsBalance: MypageSummaryField<number>;
  couponsAvailableCount: MypageSummaryField<number>;
  giftCertificatesOwned: MypageSummaryField<number>;
  /** S46 진행중 탭 구현 전 = "hidden" */
  adsActiveCount: MypageSummaryField<number>;
  trust: MypageSummaryField<MypageSummaryTrust>;
  banner: MypageSummaryField<MyPageBannerRow | null>;
};

export type MypageSummaryResponse = {
  ok: true;
  viewerId: string;
  /** ISO, UTC */
  generatedAt: string;
  fields: MypageSummaryFields;
};

export type MypageSummaryCountKey = {
  [K in keyof MypageSummaryFields]: MypageSummaryFields[K] extends MypageSummaryField<number> ? K : never;
}[keyof MypageSummaryFields];

/** ok 값만 꺼냄 — unavailable/hidden/모름 = null (0 으로 대체 금지) */
export function readMypageSummaryValue<T>(field: MypageSummaryField<T> | null | undefined): T | null {
  return field?.status === "ok" ? field.value : null;
}
