import { NextResponse } from "next/server";
import { checkSideEffectAllowed } from "@/lib/security/side-effect-gate";

/**
 * cron 부작용 게이트 (P0-A). 인증 확인 직후 호출한다.
 * 운영(배포·DB 모두 확인)이 아니면 예약 작업의 쓰기·발송을 실행하지 않고 503 을 돌려준다.
 * 규칙 SSOT: `lib/security/side-effect-gate.ts`.
 */
export function rejectCronIfSideEffectsBlocked(env: NodeJS.ProcessEnv = process.env): NextResponse | null {
  const decision = checkSideEffectAllowed("cron", env);
  if (decision.allowed) return null;
  return NextResponse.json(
    {
      ok: false,
      error: "cron_side_effects_blocked",
      reason: decision.reason,
      deployTier: decision.deployTier,
      databaseTarget: decision.databaseTarget,
    },
    { status: 503 }
  );
}
