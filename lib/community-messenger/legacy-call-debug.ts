/**
 * 레거시 통화 임시 audit·진단 로그 격리.
 * v3 ON 시 레거시 스택은 미마운트되지만 import·tsc 호환을 위해 noop 기본.
 */

type LegacyCallDebugExtra = Record<string, unknown>;

function shouldLog(): boolean {
  return process.env.NODE_ENV === "development";
}

export function logCallTerminal(
  step: string,
  extra: {
    sessionId?: string | null;
    reason?: string | null;
    status?: string | null;
    source?: string | null;
  } = {}
): void {
  if (!shouldLog()) return;
  const pathname =
    typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
  console.warn(`[call-terminal] ${step}`, { ...extra, pathname });
}

export function logAcceptAudit(step: string, extra: LegacyCallDebugExtra = {}): void {
  if (!shouldLog()) return;
  console.warn(`[accept-audit] ${step}`, extra);
}

export function logAcceptAuditBlocked(
  blockedReason: string,
  extra: LegacyCallDebugExtra = {}
): void {
  if (!shouldLog()) return;
  console.warn("[accept-audit] blocked_reason", { blockedReason, ...extra });
}

export function logAgoraAudit(step: string, extra: LegacyCallDebugExtra = {}): void {
  if (!shouldLog()) return;
  console.warn(`[agora-audit] ${step}`, extra);
}

export function logRedialAudit(step: string, extra: LegacyCallDebugExtra = {}): void {
  if (!shouldLog()) return;
  console.warn(`[redial-audit] ${step}`, extra);
}

export function logRedialPath(step: string, extra: LegacyCallDebugExtra = {}): void {
  if (!shouldLog()) return;
  console.warn(`[redial-path] ${step}`, extra);
}

export function logCallClientEndCall(extra: LegacyCallDebugExtra = {}): void {
  if (!shouldLog()) return;
  console.warn("[call-client] endCall_called", extra);
}

export function logCallClientEndClickBlocked(extra: LegacyCallDebugExtra = {}): void {
  if (!shouldLog()) return;
  console.warn("[call-client] end_click_blocked", extra);
}
