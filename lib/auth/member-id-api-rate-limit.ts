import type { NextRequest } from "next/server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

/**
 * 아이디 중복 확인·확정·자동 발급 API 요청 제한 (설계안 v3 §3.3 · D9) — 1분 기준.
 * 중복 확인(reserve)은 입력이 멈출 때마다 자동으로 불리므로(400ms) 30회, 확정·자동 발급은 10회.
 */
export const MEMBER_ID_API_RATE_LIMIT = { reserve: 30, confirm: 10, assign: 10, windowMs: 60_000 } as const;

export function enforceMemberIdApiRateLimit(
  req: NextRequest,
  userId: string,
  action: "reserve" | "confirm" | "assign"
) {
  return enforceRateLimit({
    key: `member-id:${action}:${getRateLimitKey(req, userId)}`,
    limit: MEMBER_ID_API_RATE_LIMIT[action],
    windowMs: MEMBER_ID_API_RATE_LIMIT.windowMs,
    code: "member_id_rate_limited",
  });
}
