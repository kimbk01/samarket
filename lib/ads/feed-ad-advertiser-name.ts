/**
 * 재감사 S-1 (F-1): 피드 배너 머리 「광고주」 이름 — v5 D4 설계상 캠페인 이름을 광고주로 보여 준다.
 * 예전에 자동으로 만든 이름은 내부 코드라 고객에게 보이면 안 된다.
 *   - 회원 신청 승인: `Member · <상품 코드>` (지금은 신청 회원 닉네임으로 만든다 — `approve-feed-ad-request.ts`)
 *   - 이벤트 배포: `Event banner · <이벤트 제목>` (지금은 이벤트 제목만 — `platform-promotion-distribution/adapters.ts`)
 * 이미 만들어진 행은 DB 를 고치지 않고 화면에서만 바꾼다: 회원 코드 이름 → 빈 값(머리에 「광고」), 이벤트 접두어 → 제목만.
 */
const MEMBER_CODE_NAME = /^Member · /;
const EVENT_PREFIX = /^Event banner · /;
/** FB-C17 (2026-11-04): 예전에 이름을 비우면 저장되던 기본값 — 고객에게 보이면 안 된다 */
const PLACEHOLDER_NAME = /^untitled$/i;

/**
 * 고객 화면 「광고」 옆 광고주 이름 — 거래·커뮤니티 공용(D-24) · 서버 공개 투영(PV-3)에서 한 번만 적용한다.
 * 빈 값·「Untitled」·회원 코드 이름 → "" (머리에 「광고」만).
 */
export function feedAdAdvertiserDisplayName(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw || MEMBER_CODE_NAME.test(raw) || PLACEHOLDER_NAME.test(raw)) return "";
  const stripped = raw.replace(EVENT_PREFIX, "").trim();
  return PLACEHOLDER_NAME.test(stripped) ? "" : stripped;
}

/**
 * FB-C17 ③: 회원 신청 광고의 광고주 이름 = **보는 시점의** 신청 회원 닉네임(승인 때 복사한 값이 아님).
 * 닉네임을 바꾸면 다음 조회부터 바뀐다. 닉네임이 없으면 "" (「광고」만).
 */
export function feedAdCampaignAdvertiserName(input: {
  name: string | null | undefined;
  source?: string | null;
  memberNickname?: string | null;
}): string {
  if (input.source === "MEMBER_REQUESTED") return feedAdAdvertiserDisplayName(input.memberNickname);
  return feedAdAdvertiserDisplayName(input.name);
}

/** 어드민이 이름을 비우면 「Untitled」 대신 빈 값으로 저장한다 (`feed_ad_campaigns.name` 은 NOT NULL DEFAULT '' — null 저장 불가). */
export function normalizeFeedAdCampaignNameInput(name: string | null | undefined): string {
  const raw = String(name ?? "").trim().slice(0, 120);
  return PLACEHOLDER_NAME.test(raw) ? "" : raw;
}

/** 회원 신청 승인 때 만드는 캠페인 이름 = 신청 회원 닉네임 (없으면 빈 값 → 머리에 「광고」) · 고객 화면은 보는 시점 닉네임을 쓴다 */
export function memberFeedAdCampaignName(nickname: string | null | undefined): string {
  return String(nickname ?? "").trim().slice(0, 120);
}
