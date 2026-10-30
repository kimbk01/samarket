/**
 * 거래 글쓰기 시트 열림 표시 — 시트는 URL 이 없어 앱 종료·문서 재시작 뒤 사라진다.
 * 열려 있는 동안 localStorage 에 남기고(sessionStorage 는 Android 프로세스 종료 후 남지 않음),
 * Lifecycle 이 **유효 복원**(OS_RESTORE / DOC_RESET + envelope)으로 같은 경로를 돌려줄 때만 다시 연다.
 * Lifecycle 판정은 읽기만 한다 — `docs/DIBAY_APP_LIFECYCLE_SSOT.md` §2·§6-6.
 * 로그아웃 시 일반 localStorage 정리로 함께 지워진다.
 */

import type { AppEntryDecision } from "@/lib/lifecycle/app-entry-kind";

export const TRADE_WRITE_SHEET_OPEN_MARKER_KEY = "samarket:trade-write-sheet-open:v1";

export type TradeWriteSheetOpenMarkerV1 = {
  v: 1;
  path: string;
  categoryKey: string;
  ownerUserId: string | null;
  writtenAt: number;
};

export function writeTradeWriteSheetOpenMarker(
  path: string,
  categoryKey: string,
  ownerUserId: string | null
): void {
  if (typeof window === "undefined") return;
  const p = (path.split(/[?#]/)[0] || "").trim();
  if (!p.startsWith("/")) return;
  const row: TradeWriteSheetOpenMarkerV1 = {
    v: 1,
    path: p,
    categoryKey: categoryKey.trim(),
    ownerUserId: ownerUserId?.trim() || null,
    writtenAt: Date.now(),
  };
  try {
    localStorage.setItem(TRADE_WRITE_SHEET_OPEN_MARKER_KEY, JSON.stringify(row));
  } catch {
    /* quota · private mode */
  }
}

export function readTradeWriteSheetOpenMarker(): TradeWriteSheetOpenMarkerV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TRADE_WRITE_SHEET_OPEN_MARKER_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<TradeWriteSheetOpenMarkerV1>;
    if (j.v !== 1 || typeof j.path !== "string" || typeof j.categoryKey !== "string") return null;
    return {
      v: 1,
      path: j.path,
      categoryKey: j.categoryKey,
      ownerUserId: typeof j.ownerUserId === "string" ? j.ownerUserId : null,
      writtenAt: typeof j.writtenAt === "number" ? j.writtenAt : 0,
    };
  } catch {
    return null;
  }
}

export function clearTradeWriteSheetOpenMarker(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TRADE_WRITE_SHEET_OPEN_MARKER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 문서 시작 시 1회 — 시트를 다시 열지(`reopen`) 표시만 지울지(`discard`).
 * 유효 복원 + 같은 소유자 + 복원 경로 = 시트 아래 경로 일 때만 reopen.
 * USER_COLD·AMBIGUOUS 는 화면 복원이 아니므로 열지 않는다(초안은 남아 다음 진입 때 이어쓰기).
 */
export function decideTradeWriteSheetReopen(
  decision: Pick<AppEntryDecision, "kind" | "envelope">,
  marker: TradeWriteSheetOpenMarkerV1,
  currentOwnerUserId: string | null
): "reopen" | "discard" {
  if (decision.kind !== "os_restore" && decision.kind !== "doc_reset") return "discard";
  if (!decision.envelope) return "discard";
  const owner = currentOwnerUserId?.trim() || null;
  if (!owner || marker.ownerUserId !== owner) return "discard";
  if (marker.path !== decision.envelope.path) return "discard";
  return "reopen";
}
