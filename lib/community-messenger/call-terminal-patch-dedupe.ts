"use client";

/** 동일 세션·action 터미널 PATCH 중복 방지 (pagehide·logout·end 경합) */
const inflightUntilMs = new Map<string, number>();
const TERMINAL_PATCH_DEDUPE_MS = 8_000;

export function claimCallTerminalPatch(sessionId: string, action: string): boolean {
  const sid = sessionId.trim();
  const act = action.trim();
  if (!sid || !act) return false;
  const key = `${sid}:${act}`;
  const now = Date.now();
  const until = inflightUntilMs.get(key) ?? 0;
  if (until > now) return false;
  inflightUntilMs.set(key, now + TERMINAL_PATCH_DEDUPE_MS);
  if (inflightUntilMs.size > 200) {
    for (const [k, u] of inflightUntilMs) {
      if (u <= now) inflightUntilMs.delete(k);
    }
  }
  return true;
}
