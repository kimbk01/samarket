/**
 * 일반 거래(`TradeWriteForm`) — 지도·주소 서브플로 직전 스냅샷.
 * `trade-write-form-session-draft` 와 동일 페이로드를 한 번 더 두어, 복귀 시 레이스·Strict 이중 마운트에서도 복원한다.
 *
 * **session + local 미러** — 일자리·환전(`jobs-exchange-write-meet-spot-staging`)과 동일.
 * 복귀 분기: `peekTradeWriteMeetSpotStaging` → 적용 → `stripTradeWriteMeetSpotSessionMirror`.
 *
 * @see jobs-exchange-write-meet-spot-staging.ts
 */

import type { TradeWriteFormSessionDraftV1 } from "@/lib/posts/trade-write-form-session-draft";

const MAX_AGE_MS = 1000 * 60 * 60 * 48;

export type TradeWriteMeetSpotStagingEnvelopeV1 = {
  v: 1;
  savedAt: number;
  categoryId: string;
  draft: TradeWriteFormSessionDraftV1;
};

function stagingKey(categoryId: string): string {
  return `samarket:tradeWriteMeetSpotStaging:v1:${categoryId.trim()}`;
}

function stagingLocalKey(categoryId: string): string {
  return `samarket:tradeWriteMeetSpotStagingLocal:v1:${categoryId.trim()}`;
}

/** 주소 관리·지도 직전 — `peek*` / `trade-write-form-session-draft` 와 함께 복구 */
export function persistTradeWriteMeetSpotStaging(
  categoryId: string,
  draft: TradeWriteFormSessionDraftV1
): void {
  if (typeof window === "undefined" || !categoryId.trim()) return;
  try {
    const env: TradeWriteMeetSpotStagingEnvelopeV1 = {
      v: 1,
      savedAt: Date.now(),
      categoryId: categoryId.trim(),
      draft,
    };
    const id = categoryId.trim();
    const json = JSON.stringify(env);
    sessionStorage.setItem(stagingKey(id), json);
    try {
      localStorage.setItem(stagingLocalKey(id), json);
    } catch {
      /* quota / private mode */
    }
  } catch {
    /* quota */
  }
}

function parseStagingRaw(raw: string | null, categoryId: string): TradeWriteFormSessionDraftV1 | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<TradeWriteMeetSpotStagingEnvelopeV1>;
    if (
      o.v !== 1 ||
      typeof o.savedAt !== "number" ||
      Date.now() - o.savedAt > MAX_AGE_MS ||
      o.categoryId !== categoryId.trim() ||
      !o.draft ||
      typeof o.draft !== "object"
    ) {
      return null;
    }
    const d = o.draft as TradeWriteFormSessionDraftV1;
    if (d.v !== 1 || d.categoryId !== categoryId.trim()) return null;
    return d;
  } catch {
    return null;
  }
}

function readStagingEnvelopeRaw(categoryId: string): string | null {
  const id = categoryId.trim();
  if (!id) return null;
  return (
    (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(stagingKey(id)) : null) ??
    (typeof localStorage !== "undefined" ? localStorage.getItem(stagingLocalKey(id)) : null)
  );
}

/** 제거 없이 초안만 — 지도·주소 복귀 분기 */
export function peekTradeWriteMeetSpotStaging(categoryId: string): TradeWriteFormSessionDraftV1 | null {
  if (typeof window === "undefined" || !categoryId.trim()) return null;
  return parseStagingRaw(readStagingEnvelopeRaw(categoryId), categoryId.trim());
}

/** 이어쓰기 확정 등 세션+로컬 일괄 삭제 */
export function consumeTradeWriteMeetSpotStaging(categoryId: string): TradeWriteFormSessionDraftV1 | null {
  const id = categoryId.trim();
  if (typeof window === "undefined" || !id) return null;
  try {
    const parsed = peekTradeWriteMeetSpotStaging(id);
    if (!parsed) return null;
    sessionStorage.removeItem(stagingKey(id));
    try {
      localStorage.removeItem(stagingLocalKey(id));
    } catch {
      /* ignore */
    }
    return parsed;
  } catch {
    return null;
  }
}

/** 복귀 직후 세션 키만 제거 — 로컬 미러로 Strict 재마운트 대비 */
export function stripTradeWriteMeetSpotSessionMirror(categoryId: string): void {
  if (!categoryId.trim()) return;
  try {
    sessionStorage.removeItem(stagingKey(categoryId.trim()));
  } catch {
    /* ignore */
  }
}

export function clearTradeWriteMeetSpotStaging(categoryId: string): void {
  if (!categoryId.trim()) return;
  const id = categoryId.trim();
  try {
    sessionStorage.removeItem(stagingKey(id));
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(stagingLocalKey(id));
  } catch {
    /* ignore */
  }
}
