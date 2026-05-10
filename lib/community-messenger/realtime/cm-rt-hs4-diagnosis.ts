/**
 * HS4 — Realtime 구독 안정화 **진단 전용** (동작 변경 없음).
 * prefix: `[cm-rt-hs4-diagnosis]`
 *
 * 활성: `SAMARKET_MESSENGER_TRACE_LOG=1` 또는 `CM_RT_HS4_DIAG=1` 또는 `NEXT_PUBLIC_CM_RT_HS4_DIAG=1`
 */

import { samarketMessengerTraceLogEnabled } from "@/lib/debug/samarket-server-trace-flags";

export type CmRtHs4SubscribeContext = {
  /** `roomsBindFingerprint` 또는 메타+룸 공통 원본(fingerprint split 로 생성된 문자열) */
  fingerprint?: string | null;
  channelBindRole?: "home_meta" | "home_rooms_in";
  chunkOffset?: number;
  /** `messengerRealtimeBumpHomeChannelPhysicalBindCount()` 스냅샷 */
  bindOrdinal?: number;
};

export function cmRtHs4DiagnosisEnabled(): boolean {
  const env = typeof process !== "undefined" ? process.env : undefined;
  if (!env) return false;
  if (samarketMessengerTraceLogEnabled()) return true;
  if (env.CM_RT_HS4_DIAG === "1") return true;
  if (env.NEXT_PUBLIC_CM_RT_HS4_DIAG === "1") return true;
  return false;
}

/** 긴 fingerprint 전체 로그 대신 길이·짧은 다이제스트(collision 가능성 있음 — 트렌드용) */
export function cmRtHs4FingerprintDigest(raw: string | null | undefined): { fpLen: number; fpDigest8: string } {
  const s = raw ?? "";
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return { fpLen: s.length, fpDigest8: (h >>> 0).toString(16).padStart(8, "0") };
}

export function cmRtHs4DiagnosisLog(event: string, payload: Record<string, unknown>): void {
  if (!cmRtHs4DiagnosisEnabled()) return;
  try {
    // eslint-disable-next-line no-console -- HS4 diagnosis round (explicit)
    console.info("[cm-rt-hs4-diagnosis]", event, payload);
  } catch {
    /* ignore */
  }
}

/** HS4-1 세션 롤업 요약 — prefix 고정 */
export function cmRtHs4SessionRollupLog(payload: Record<string, unknown>): void {
  if (!cmRtHs4DiagnosisEnabled()) return;
  try {
    // eslint-disable-next-line no-console -- HS4-1 session rollup (explicit)
    console.info("[cm-rt-hs4-session-rollup]", payload);
  } catch {
    /* ignore */
  }
}
