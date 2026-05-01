/**
 * 일자리·환전 글쓰기에서 거래 희망 장소 지도로 이동할 때 폼 상태 보존 (전면 탭 전환 시 언마운트 대비).
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
