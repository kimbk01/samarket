import { NextResponse } from "next/server";
import { evaluateSideEffectDispatchGate } from "@/lib/config/test-production-isolation";

/**
 * Fail-closed cron guard: block scheduled mutations when a non-Production
 * deploy is wired to the Production Supabase project (Preview→prod leak).
 *
 * Production deploy path is unchanged when DB target is Production.
 */
export function rejectCronIfSideEffectsBlocked(
  env: NodeJS.ProcessEnv = process.env
): NextResponse | null {
  const decision = evaluateSideEffectDispatchGate(env);
  if (decision.allowed) return null;

  return NextResponse.json(
    {
      ok: false,
      error: "cron_side_effects_blocked",
      reason: decision.reason,
      deployTier: decision.deployTier,
      databaseTarget: decision.database.target,
      projectRef: decision.database.projectRef,
    },
    { status: 503 }
  );
}
