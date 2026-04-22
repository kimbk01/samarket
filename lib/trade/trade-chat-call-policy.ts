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

/** 거래 채팅 메뉴·안내용 짧은 한국어 문구 */
export function tradeChatCallPolicySummaryKo(p: TradeChatCallPolicy): string {
  if (p === "voice_and_video") return "이 글에서는 거래 채팅에서 음성·영상 통화가 허용돼요.";
  if (p === "voice_only") return "이 글에서는 거래 채팅에서 음성 통화만 허용돼요.";
  return "이 글에서는 거래 채팅 통화가 허용되지 않아요.";
}
