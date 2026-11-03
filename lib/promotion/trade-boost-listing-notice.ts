/**
 * 거래 상위노출 ↔ 글 상태 연동 (설계 docs/audit/trade-promotion-listing-lifecycle-design-2026-11-03.md)
 * 판매완료·삭제 = 광고 종료(환급 0), 숨김 = 광고 일시정지 — DB 트리거 `trg_posts_zz_trade_promotion_sync` 가 처리한다.
 * 확인창에는 그 글이 광고 중(진행·일시정지·심사 중)일 때만 한 줄을 더 보여 준다.
 *
 * 재감사 B-6 (2026-11-04): 누른 뒤에 조회하면 느린 망에서 확인창이 늦게 뜨고 두 번 누르면 겹쳤다 →
 * 판매자 메뉴·판매완료 버튼이 보일 때 `prefetchTradeBoostState` 로 미리 받고(10초), 누를 때는 받아 둔 값을 쓰며
 * 없으면 최대 1.2초만 기다린다(넘으면 안내 없이 — 종료·일시정지 자체는 DB 트리거가 보장).
 */
import type { MessageKey } from "@/lib/i18n/messages";
import { tradeBoostOrderPhase, type TradeBoostOrderPhase } from "@/lib/promotion/trade-boost-order-state";

export type TradeBoostListingAction = "sold" | "delete" | "hide";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const CACHE_TTL_MS = 10_000;
const WAIT_MS = 1_200;

type Entry = { phase: TradeBoostOrderPhase; at: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<TradeBoostOrderPhase>>();

async function loadPhase(id: string): Promise<TradeBoostOrderPhase> {
  const running = inflight.get(id);
  if (running) return running;
  const p = (async (): Promise<TradeBoostOrderPhase> => {
    try {
      const res = await fetch(
        `/api/me/points/promotion-orders?domain=trade&targetId=${encodeURIComponent(id)}`,
        { credentials: "include", cache: "no-store" }
      );
      if (!res.ok) return "ended";
      const json = (await res.json().catch(() => null)) as {
        activeForTarget?: { orderStatus?: string; startAt?: string; endAt?: string } | null;
      } | null;
      const phase = json?.activeForTarget ? tradeBoostOrderPhase(json.activeForTarget) : "ended";
      cache.set(id, { phase, at: Date.now() });
      return phase;
    } catch {
      return "ended";
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, p);
  return p;
}

/** 판매자 메뉴·판매완료 버튼이 보일 때 1회 — 같은 글은 10초 안에 다시 받지 않는다 */
export function prefetchTradeBoostState(postId: string | null | undefined): void {
  const id = String(postId ?? "").trim();
  if (!id) return;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return;
  void loadPhase(id);
}

async function phaseForConfirm(id: string): Promise<TradeBoostOrderPhase> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.phase;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<TradeBoostOrderPhase>((resolve) => {
    timer = setTimeout(() => resolve("ended"), WAIT_MS);
  });
  try {
    return await Promise.race([loadPhase(id), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 확인창 안내 키 — 심사 중 신청은 「취소돼요」(포인트 미차감), 그 외 판매완료·삭제는 「끝나요」, 숨김은 「멈춰요」 */
export function tradeBoostListingNoteKey(
  action: TradeBoostListingAction,
  phase: TradeBoostOrderPhase = "live"
): MessageKey {
  if (action === "hide") return "trade_ad_listing_note_hide";
  return phase === "pending" ? "trade_ad_listing_note_cancel" : "trade_ad_listing_note_end";
}

/** 광고 중이면(진행·일시정지·심사 중) true */
export async function isTradeBoostRunningForPost(postId: string): Promise<boolean> {
  const id = postId.trim();
  if (!id) return false;
  return (await phaseForConfirm(id)) !== "ended";
}

/**
 * 확인창 설명 = 기존 문구 + (광고 중이면) 광고 안내 한 줄.
 * 미리 받은 값이 있으면 기다리지 않으므로 누른 뒤 확인창이 뜨기까지의 틈이 예전(안내 없던 때)과 같다.
 */
export async function withTradeBoostListingNote(
  t: Translate,
  postId: string,
  action: TradeBoostListingAction,
  description?: string
): Promise<string | undefined> {
  const id = postId.trim();
  if (!id) return description;
  const phase = await phaseForConfirm(id);
  if (phase === "ended") return description;
  /** 심사 중 신청은 숨겨도 처리하지 않는다(승인 때 판정 · B-7) */
  if (action === "hide" && phase === "pending") return description;
  const note = t(tradeBoostListingNoteKey(action, phase));
  return description ? `${description} ${note}` : note;
}
