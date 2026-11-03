/**
 * 재감사 S-1 (F-1): 피드 배너 머리 「광고주」 이름 — v5 D4 설계상 캠페인 이름을 광고주로 보여 준다.
 * 예전에 자동으로 만든 이름은 내부 코드라 고객에게 보이면 안 된다.
 *   - 회원 신청 승인: `Member · <상품 코드>` (지금은 신청 회원 닉네임으로 만든다 — `approve-feed-ad-request.ts`)
 *   - 이벤트 배포: `Event banner · <이벤트 제목>` (지금은 이벤트 제목만 — `platform-promotion-distribution/adapters.ts`)
 * 이미 만들어진 행은 DB 를 고치지 않고 화면에서만 바꾼다: 회원 코드 이름 → 빈 값(머리에 「광고」), 이벤트 접두어 → 제목만.
 */
const MEMBER_CODE_NAME = /^Member · /;
const EVENT_PREFIX = /^Event banner · /;

export function feedAdAdvertiserDisplayName(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw || MEMBER_CODE_NAME.test(raw)) return "";
  return raw.replace(EVENT_PREFIX, "").trim();
}

/** 회원 신청 승인 때 만드는 캠페인 이름 = 신청 회원 닉네임 (없으면 빈 값 → 머리에 「광고」) */
export function memberFeedAdCampaignName(nickname: string | null | undefined): string {
  return String(nickname ?? "").trim().slice(0, 120);
}
