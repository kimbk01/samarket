import type { TradeListDto } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";

/**
 * 거래 채팅 목록(Domain canary) SWR 즉시 페인트용 세션 캐시.
 *
 * 문제: `DomainTradeListCanaryGate`는 매 마운트마다 `auth.getUser()` → allowlist 확인 →
 * `/api/messenger/domain-read/trade-list` fetch를 순서대로 기다린 뒤에야 첫 화면을 그린다
 * (그동안 "거래 채팅 불러오는 중…" 전체 화면 placeholder). 냉시작 시 이 대기가 500ms~1.3s로
 * 측정되어 "느리다/멈췄다"는 체감의 핵심 원인이다.
 *
 * 해결: 직전에 성공적으로 받은 DTO를 세션 스토리지에 남겨두고, 다음 마운트에서는(같은 뷰어
 * 기준) stale 여부와 무관하게 즉시 그 데이터로 첫 페인트를 한다(Stale-While-Revalidate).
 * 백그라운드에서는 항상 fresh fetch를 그대로 수행해 화면을 최신화한다 — 캐시는 오직
 * "첫 페인트를 앞당기는 용도"이고 신뢰 가능한 최신 데이터 판단은 기존 흐름이 그대로 담당한다.
 */

const STORAGE_KEY_PREFIX = "samarket.messenger.domain-trade-list-canary.v1.";
/** 참고용 — 이 시간이 지난 캐시는 여전히 첫 페인트에 쓰이지만 UI에 굳이 노출하지 않는다. */
const SOFT_TTL_MS = 5 * 60 * 1000;

type CacheEntry = { at: number; dto: TradeListDto };

function storageKey(viewerUserId: string): string {
  return `${STORAGE_KEY_PREFIX}${viewerUserId}`;
}

/** 직전 성공 DTO를 즉시 반환 (staleness 무관 — 첫 페인트 전용). 없으면 null. */
export function peekDomainTradeListCanaryCache(viewerUserId: string | null | undefined): TradeListDto | null {
  const uid = viewerUserId?.trim();
  if (!uid || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.dto || parsed.dto.viewerUserId !== uid) return null;
    return parsed.dto;
  } catch {
    return null;
  }
}

export function isDomainTradeListCanaryCacheFresh(viewerUserId: string | null | undefined): boolean {
  const uid = viewerUserId?.trim();
  if (!uid || typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(storageKey(uid));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as CacheEntry;
    return Boolean(parsed?.at) && Date.now() - parsed.at <= SOFT_TTL_MS;
  } catch {
    return false;
  }
}

export function primeDomainTradeListCanaryCache(dto: TradeListDto): void {
  const uid = dto.viewerUserId?.trim();
  if (!uid || typeof window === "undefined") return;
  try {
    const entry: CacheEntry = { at: Date.now(), dto };
    sessionStorage.setItem(storageKey(uid), JSON.stringify(entry));
  } catch {
    // ignore quota / private mode
  }
}

export function clearDomainTradeListCanaryCache(viewerUserId: string | null | undefined): void {
  const uid = viewerUserId?.trim();
  if (!uid || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(uid));
  } catch {
    // ignore
  }
}
