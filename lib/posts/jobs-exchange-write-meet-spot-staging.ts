/**
 * 일자리(`JobsWriteForm`)·환전(`ExchangeWriteForm`) 글쓰기 — 폼 이탈 시 스냅샷을 두고 복귀 시 복원한다.
 * **sessionStorage + 동일 JSON localStorage 미러** — 탭·Strict 이중 마운트에서 세션만 비워져도 `peek*` 이 로컬에서 복구.
 * 주소·지도 복귀 분기에서는 `peek*` → 적용 후 **`strip*SessionMirror`**(세션 키만 제거), 이어쓰기 확정·폐기는 `consume*` / `clear*` 로 로컬까지 삭제.
 *
 * **사용처 (동일 페이로드·동일 키)**  
 * - 거래 희망 장소 **풀페이지 지도**로 가기 직전 (`handleBeforeMeetSpotPick`)  
 * - **주소 관리**(`/mypage/addresses`)로 가기 직전 (`TradeDefaultLocationBlock` → `onBeforeNavigateToAddresses`)
 * - **나가기·시트 닫기** 직전(`persistSnapshotBeforeLeaveRef`) — 일반 거래 `TradeWriteForm` 과 같은 카테고리 단위 스코프.
 *
 * **복구 UX**: 주소·지도 복귀 시 `peek*` → 폼 반영 → `strip*SessionMirror`(세션만 제거, 로컬 미러 유지). 「이어쓰기」확정 시 `consume*` 으로 로컬까지 삭제.
 * 나가기·시트 닫기 저장만 한 경우 플래그 없음 → 재진입 시 `peek*` 후 「이어쓰기 / 새로 작성」(`discardTradeWriteStashedDraft` 동일 categoryId 정리).
 *
 * 함수 이름의 `MeetSpot`은 도입 당시 지도 전용 스테이징에서 유지된 것이며, 주소 화면 이동 시에도 같은 저장소를 쓴다.
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

/** React Strict 이중 마운트 등으로 세션 키가 먼저 비워져도 복구 — session 과 동일 JSON */
function jobsLocalKey(categoryId: string): string {
  return `samarket:jobsWriteMeetSpotStagingLocal:v1:${categoryId}`;
}

/** 지도 또는 주소 관리 이탈 직전 호출 — 복귀 시 `consumeJobsWriteMeetSpotStaging` 으로 복원 */
export function persistJobsWriteBeforeMeetSpot(categoryId: string, data: Omit<JobsWriteMeetSpotStagingV1, "v" | "savedAt">): void {
  try {
    const payload: JobsWriteMeetSpotStagingV1 = { v: 1, savedAt: Date.now(), ...data };
    const id = categoryId.trim();
    const json = JSON.stringify(payload);
    sessionStorage.setItem(jobsKey(id), json);
    try {
      localStorage.setItem(jobsLocalKey(id), json);
    } catch {
      /* quota / private mode */
    }
  } catch {
    /* quota */
  }
}

function parseJobsStagingRaw(raw: string | null): JobsWriteMeetSpotStagingV1 | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as JobsWriteMeetSpotStagingV1;
    if (o.v !== 1 || typeof o.savedAt !== "number" || Date.now() - o.savedAt > MAX_AGE_MS) return null;
    return o;
  } catch {
    return null;
  }
}

function readJobsStagingCombined(categoryId: string): JobsWriteMeetSpotStagingV1 | null {
  const id = categoryId.trim();
  if (!id) return null;
  const raw =
    (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(jobsKey(id)) : null) ??
    (typeof localStorage !== "undefined" ? localStorage.getItem(jobsLocalKey(id)) : null);
  return parseJobsStagingRaw(raw);
}

/** 제거하지 않고 읽기 — `TradeWriteForm` 초안 복구 확인과 동일하게 재진입 시 이어쓰기 선택 전까지 유지 */
export function peekJobsWriteMeetSpotStaging(categoryId: string): JobsWriteMeetSpotStagingV1 | null {
  if (typeof window === "undefined" || !categoryId.trim()) return null;
  return readJobsStagingCombined(categoryId);
}

export function consumeJobsWriteMeetSpotStaging(categoryId: string): JobsWriteMeetSpotStagingV1 | null {
  const id = categoryId.trim();
  if (typeof window === "undefined" || !id) return null;
  try {
    const o = readJobsStagingCombined(id);
    if (!o) return null;
    sessionStorage.removeItem(jobsKey(id));
    try {
      localStorage.removeItem(jobsLocalKey(id));
    } catch {
      /* ignore */
    }
    return o;
  } catch {
    return null;
  }
}

export function clearJobsWriteMeetSpotStaging(categoryId: string): void {
  if (!categoryId.trim()) return;
  const id = categoryId.trim();
  try {
    sessionStorage.removeItem(jobsKey(id));
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(jobsLocalKey(id));
  } catch {
    /* ignore */
  }
}

/**
 * 주소·지도 복귀 분기에서 `consume*` 대신 사용 — 세션 키만 제거해 로컬 미러로 Strict 이중 마운트·즉시 재`peek` 에 대비.
 * (이어쓰기 버튼·폐기·저장 시에는 `consume*` / `clear*` 로 로컬까지 정리)
 */
export function stripJobsWriteMeetSpotSessionMirror(categoryId: string): void {
  if (!categoryId.trim()) return;
  try {
    sessionStorage.removeItem(jobsKey(categoryId.trim()));
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

function exchangeLocalKey(categoryId: string): string {
  return `samarket:exchangeWriteMeetSpotStagingLocal:v1:${categoryId}`;
}

/** 지도 또는 주소 관리 이탈 직전 호출 — 복귀 시 `consumeExchangeWriteMeetSpotStaging` 으로 복원 */
export function persistExchangeWriteBeforeMeetSpot(
  categoryId: string,
  data: Omit<ExchangeWriteMeetSpotStagingV1, "v" | "savedAt">
): void {
  try {
    const payload: ExchangeWriteMeetSpotStagingV1 = { v: 1, savedAt: Date.now(), ...data };
    const id = categoryId.trim();
    const json = JSON.stringify(payload);
    sessionStorage.setItem(exchangeKey(id), json);
    try {
      localStorage.setItem(exchangeLocalKey(id), json);
    } catch {
      /* quota */
    }
  } catch {
    /* quota */
  }
}

function parseExchangeStagingRaw(raw: string | null): ExchangeWriteMeetSpotStagingV1 | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as ExchangeWriteMeetSpotStagingV1;
    if (o.v !== 1 || typeof o.savedAt !== "number" || Date.now() - o.savedAt > MAX_AGE_MS) return null;
    return o;
  } catch {
    return null;
  }
}

function readExchangeStagingCombined(categoryId: string): ExchangeWriteMeetSpotStagingV1 | null {
  const id = categoryId.trim();
  if (!id) return null;
  const raw =
    (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(exchangeKey(id)) : null) ??
    (typeof localStorage !== "undefined" ? localStorage.getItem(exchangeLocalKey(id)) : null);
  return parseExchangeStagingRaw(raw);
}

export function peekExchangeWriteMeetSpotStaging(categoryId: string): ExchangeWriteMeetSpotStagingV1 | null {
  if (typeof window === "undefined" || !categoryId.trim()) return null;
  return readExchangeStagingCombined(categoryId);
}

export function consumeExchangeWriteMeetSpotStaging(categoryId: string): ExchangeWriteMeetSpotStagingV1 | null {
  const id = categoryId.trim();
  if (typeof window === "undefined" || !id) return null;
  try {
    const o = readExchangeStagingCombined(id);
    if (!o) return null;
    sessionStorage.removeItem(exchangeKey(id));
    try {
      localStorage.removeItem(exchangeLocalKey(id));
    } catch {
      /* ignore */
    }
    return o;
  } catch {
    return null;
  }
}

export function clearExchangeWriteMeetSpotStaging(categoryId: string): void {
  if (!categoryId.trim()) return;
  const id = categoryId.trim();
  try {
    sessionStorage.removeItem(exchangeKey(id));
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(exchangeLocalKey(id));
  } catch {
    /* ignore */
  }
}

/** @see stripJobsWriteMeetSpotSessionMirror */
export function stripExchangeWriteMeetSpotSessionMirror(categoryId: string): void {
  if (!categoryId.trim()) return;
  try {
    sessionStorage.removeItem(exchangeKey(categoryId.trim()));
  } catch {
    /* ignore */
  }
}
