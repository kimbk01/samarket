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
  /**
   * D5 — 「등록」 중 인증·보완 화면(동의·전화·프로필·로그인)으로 나감. 표시 경로로 돌아오면 시트를 다시 연다.
   * Lifecycle 복원 판정과 별개 (같은 문서 이동·동의 완료 후 새 문서 모두).
   */
  gate?: boolean;
  /** gate 를 기록한 시각(ms) — 이 문서 시작 이후면 「이 문서 안에서 나감」(Provider 가 다시 마운트돼도 판정 유지) */
  gateAt?: number;
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
      ...(j.gate === true ? { gate: true } : {}),
      ...(typeof j.gateAt === "number" ? { gateAt: j.gateAt } : {}),
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
  currentOwnerUserId: string | null,
  /** 같은 출처 인증·보완 화면에서 넘어온 문서 — 등록 중 동의 화면 다녀옴(gate 미기록 대비, D5) */
  cameFromGate = false
): "reopen" | "discard" {
  const owner = currentOwnerUserId?.trim() || null;
  if (!owner || marker.ownerUserId !== owner) return "discard";
  /** 인증 화면 복귀: 경로 일치는 Provider 가 대기하며 확인 */
  if (cameFromGate) return "reopen";
  if (decision.kind !== "os_restore" && decision.kind !== "doc_reset") return "discard";
  if (!decision.envelope) return "discard";
  if (marker.path !== decision.envelope.path) return "discard";
  return "reopen";
}

/** 열린 시트의 표시에 「인증·보완 화면으로 나감」을 기록 (표시가 없으면 아무것도 안 함) */
export function markTradeWriteSheetGateDeparture(): void {
  const m = readTradeWriteSheetOpenMarker();
  if (!m) return;
  try {
    localStorage.setItem(
      TRADE_WRITE_SHEET_OPEN_MARKER_KEY,
      JSON.stringify({ ...m, gate: true, gateAt: Date.now() })
    );
  } catch {
    /* quota · private mode */
  }
}

/**
 * 등록 중 나가는 인증·보완 화면 — `lib/auth/client-access-flow.ts` 의 이동 대상만.
 * `/mypage` 는 `returnTo` 가 있을 때만(프로필 보완 진입) — 일반 내정보 탭은 아니다.
 */
export function isTradeWriteGatePath(pathname: string, search: string): boolean {
  const p = (pathname.split("?")[0] || "/").trim();
  if (p === "/login" || p.startsWith("/login/")) return true;
  if (p === "/signup" || p.startsWith("/signup/")) return true;
  if (p.startsWith("/auth/onboarding/")) return true;
  if (p.startsWith("/mypage/required/")) return true;
  if (p === "/mypage/addresses") return true;
  if (p === "/mypage") {
    try {
      return new URLSearchParams(search).has("returnTo");
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * `gate` 표시가 있을 때 경로마다 — reopen / wait / discard.
 * - 인증·보완 화면 → wait
 * - 표시 경로로 돌아옴 → 이 문서 안에서 나갔거나(`departedThisDocument`), 이 문서가 인증 화면에서 넘어온 새 문서
 *   (`newDocumentFromGate`: 같은 프로세스 재시작·복원 또는 같은 출처 인증 화면 referrer)일 때만 reopen.
 *   새로 실행·새 방문(웹 새 탭 등)은 discard — SSOT §2.
 * - 새 문서의 부팅 경로 "/" → Lifecycle 이동을 기다림 (이 문서 안에서 나간 뒤의 "/" 는 홈 화면이므로 discard)
 */
export function decideTradeWriteSheetGateReturn(
  marker: TradeWriteSheetOpenMarkerV1,
  currentOwnerUserId: string | null,
  pathname: string,
  search: string,
  ctx: { departedThisDocument: boolean; newDocumentFromGate: boolean }
): "reopen" | "wait" | "discard" {
  const owner = currentOwnerUserId?.trim() || null;
  if (!owner || marker.ownerUserId !== owner) return "discard";
  const p = (pathname.split("?")[0] || "/").trim();
  if (isTradeWriteGatePath(p, search)) return "wait";
  if (p === marker.path) return ctx.departedThisDocument || ctx.newDocumentFromGate ? "reopen" : "discard";
  if (p === "/" && !ctx.departedThisDocument) return "wait";
  return "discard";
}

/** 이 문서가 시작된 시각(ms) — `performance.timeOrigin` */
export function readDocumentStartedAtMs(): number {
  if (typeof performance !== "undefined" && typeof performance.timeOrigin === "number") return performance.timeOrigin;
  return 0;
}

/** 같은 출처 인증·보완 화면에서 넘어온 문서인지 (`document.referrer`) */
export function documentCameFromTradeWriteGate(): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  try {
    if (!document.referrer) return false;
    const u = new URL(document.referrer);
    if (u.origin !== window.location.origin) return false;
    return isTradeWriteGatePath(u.pathname, u.search);
  } catch {
    return false;
  }
}
