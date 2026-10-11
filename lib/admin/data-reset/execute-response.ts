/**
 * P0 — public shape of the Data Reset execute API response.
 *
 * Previously the route echoed the full server-rebuilt plan on every outcome, including
 * BLOCKED. A BLOCKED reply therefore handed back the correct planHash and
 * typedConfirmationPhrase for whatever (planId, createdAt) the client chose, which is
 * enough to forge the next request. The execute response now never carries the plan
 * hash, the confirmation phrase or the plan id; BLOCKED returns only the reason code.
 */

import type { DataResetExecuteResult } from "@/lib/admin/data-reset/types";

export type DataResetExecutePublicResponse = {
  ok: boolean;
  overall: DataResetExecuteResult["overall"];
  error?: string;
  phases: { phase: string; status: string; detail?: string }[];
  executedCounts?: Record<string, number>;
  clientSessionInvalidationRequired?: boolean;
  clientInvalidation?: string[];
};

export function toDataResetExecutePublicResponse(
  result: DataResetExecuteResult
): DataResetExecutePublicResponse {
  const phases = (result.phases ?? []).map((p) => ({
    phase: String(p.phase),
    status: String(p.status),
    detail: p.detail,
  }));

  if (result.overall === "BLOCKED") {
    const blocked = phases.find((p) => p.status === "BLOCKED");
    return {
      ok: false,
      overall: "BLOCKED",
      error: blocked?.detail || "execute_blocked",
      phases,
    };
  }

  return {
    ok: result.ok,
    overall: result.overall,
    phases,
    executedCounts: result.executedCounts,
    clientSessionInvalidationRequired: result.clientSessionInvalidationRequired,
    clientInvalidation: result.clientInvalidation ?? result.plan?.clientInvalidation,
  };
}
