/**
 * 일자리(`JobsWriteForm`)·환전(`ExchangeWriteForm`) 글쓰기 — 폼 이탈 시 세션에 스냅샷을 두고 복귀 시 복원한다.
 *
 * **사용처 (동일 페이로드·동일 키)**  
 * - 거래 희망 장소 **풀페이지 지도**로 가기 직전 (`handleBeforeMeetSpotPick`)  
 * - **주소 관리**(`/mypage/addresses`)로 가기 직전 (`TradeDefaultLocationBlock` → `onBeforeNavigateToAddresses`)
 *
 * 함수 이름의 `MeetSpot`은 도입 당시 지도 전용 스테이징에서 유지된 것이며, 주소 화면 이동 시에도 같은 저장소를 쓴다.
 * 전면 라우트 전환·시트 언마운트 대비.
 */

const MAX_AGE_MS = 1000 * 60 * 60 * 48;

export type JobListingKindStaging = "hire" | "work";

export type JobsWriteMeetSpotStagingV1 = {
  v: 1;
  savedAt: number;
  listingKind: JobListingKindStaging;
  title: string;
  workCategory: string;
  workCategoryOther: string;
  workTerm: string;
  payType: string;
  payAmount: string;
  description: string;
  region: string;
  city: string;
  tradeTopicChildId: string;
  workDate: string;
  workDateEnd: string;
  workTimeStart: string;
  workTimeEnd: string;
  sameDayPay: boolean;
  companyName: string;
  availableTime: string;
  experienceLevel: string;
  tradeChatCallPolicy: string;
  termsAgreed: boolean;
  /** 업로드 반영 후 URL 목록 */
  imageUrls: string[];
};

function jobsKey(categoryId: string): string {
  return `samarket:jobsWriteMeetSpotStaging:v1:${categoryId}`;
}

/** 지도 또는 주소 관리 이탈 직전 호출 — 복귀 시 `consumeJobsWriteMeetSpotStaging` 으로 복원 */
export function persistJobsWriteBeforeMeetSpot(categoryId: string, data: Omit<JobsWriteMeetSpotStagingV1, "v" | "savedAt">): void {
  try {
    const payload: JobsWriteMeetSpotStagingV1 = { v: 1, savedAt: Date.now(), ...data };
    sessionStorage.setItem(jobsKey(categoryId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function consumeJobsWriteMeetSpotStaging(categoryId: string): JobsWriteMeetSpotStagingV1 | null {
  try {
    const raw = sessionStorage.getItem(jobsKey(categoryId));
    if (!raw) return null;
    sessionStorage.removeItem(jobsKey(categoryId));
    const o = JSON.parse(raw) as JobsWriteMeetSpotStagingV1;
    if (o.v !== 1 || typeof o.savedAt !== "number" || Date.now() - o.savedAt > MAX_AGE_MS) return null;
    return o;
  } catch {
    return null;
  }
}

export function clearJobsWriteMeetSpotStaging(categoryId: string): void {
  try {
    sessionStorage.removeItem(jobsKey(categoryId));
  } catch {
    /* ignore */
  }
}

export type ExchangeWriteMeetSpotStagingV1 = {
  v: 1;
  savedAt: number;
  direction: "sell" | "buy";
  rate: string;
  ratePlus: string;
  amount: string;
  ratesFetchedAt: string | null;
  sellerPrep: string[];
  buyerPrep: string[];
  memo: string;
  descriptionAppend: string;
  region: string;
  city: string;
  tradeTopicChildId: string;
  imageUrls: string[];
};

function exchangeKey(categoryId: string): string {
  return `samarket:exchangeWriteMeetSpotStaging:v1:${categoryId}`;
}

/** 지도 또는 주소 관리 이탈 직전 호출 — 복귀 시 `consumeExchangeWriteMeetSpotStaging` 으로 복원 */
export function persistExchangeWriteBeforeMeetSpot(
  categoryId: string,
  data: Omit<ExchangeWriteMeetSpotStagingV1, "v" | "savedAt">
): void {
  try {
    const payload: ExchangeWriteMeetSpotStagingV1 = { v: 1, savedAt: Date.now(), ...data };
    sessionStorage.setItem(exchangeKey(categoryId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function consumeExchangeWriteMeetSpotStaging(categoryId: string): ExchangeWriteMeetSpotStagingV1 | null {
  try {
    const raw = sessionStorage.getItem(exchangeKey(categoryId));
    if (!raw) return null;
    sessionStorage.removeItem(exchangeKey(categoryId));
    const o = JSON.parse(raw) as ExchangeWriteMeetSpotStagingV1;
    if (o.v !== 1 || typeof o.savedAt !== "number" || Date.now() - o.savedAt > MAX_AGE_MS) return null;
    return o;
  } catch {
    return null;
  }
}

export function clearExchangeWriteMeetSpotStaging(categoryId: string): void {
  try {
    sessionStorage.removeItem(exchangeKey(categoryId));
  } catch {
    /* ignore */
  }
}
