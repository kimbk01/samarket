import type { NextRequest } from "next/server";
import { enforceRateLimit, getClientIp } from "@/lib/http/api-route";

/**
 * 웹훅 시크릿 무차별 시도·오남용 완화 — IP당 분당 요청 상한 (성공·실패 모두 카운트).
 * Redis(Upstash) 있으면 프로세스 간 공유.
 */
export async function enforceWebhookRateLimit(
  req: NextRequest,
  routeKey: string,
  options?: { limit?: number; windowMs?: number }
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const ip = getClientIp(req);
  const limit = options?.limit ?? 120;
  const windowMs = options?.windowMs ?? 60_000;
  const key = `webhook:${routeKey}:${ip}`;
  const rl = await enforceRateLimit({
    key,
    limit,
    windowMs,
    message: "웹훅 요청 한도를 초과했습니다.",
    code: "webhook_rate_limited",
  });
  if (!rl.ok) return { ok: false, response: rl.response };
  return { ok: true };
}
