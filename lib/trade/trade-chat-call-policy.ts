/**
 * 거래 1:1 채팅 — 판매자가 글에 설정하는 **통화 허용** 범위.
 * 저장 위치: `posts.meta.trade_chat_call_policy`
 */
export type TradeChatCallPolicy = "none" | "voice_only" | "voice_and_video";

const ALLOWED: TradeChatCallPolicy[] = ["none", "voice_only", "voice_and_video"];

export function normalizeTradeChatCallPolicy(raw: unknown): TradeChatCallPolicy {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "voice_only" || s === "voice_and_video" || s === "none") return s;
  return "none";
}

export function isTradeChatCallPolicy(v: unknown): v is TradeChatCallPolicy {
  return typeof v === "string" && (ALLOWED as string[]).includes(v);
}

export function tradeChatCallPolicyAllowsVoice(p: TradeChatCallPolicy): boolean {
  return p === "voice_only" || p === "voice_and_video";
}

export function tradeChatCallPolicyAllowsVideo(p: TradeChatCallPolicy): boolean {
  return p === "voice_and_video";
}
