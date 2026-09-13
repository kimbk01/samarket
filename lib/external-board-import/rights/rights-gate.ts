import type { ExternalBoardRightsStatus } from "@/lib/external-board-import/product-lock";

export const RIGHTS_PUBLIC_IS_NOT_REPUBLISH =
  "Public availability is not republishing rights. Source-level rights basis is required." as const;

export type RightsGateInput = {
  rightsStatus: ExternalBoardRightsStatus | string | null | undefined;
  rightsBasis?: string | null | undefined;
};

export type RightsGateResult =
  | { ok: true }
  | { ok: false; failureStage: "rights"; failureCode: string; failureMessage: string };

/**
 * Block discover / fetch / publish unless rights are explicitly declared.
 */
export function assertExternalBoardRightsDeclared(input: RightsGateInput): RightsGateResult {
  const status = String(input.rightsStatus ?? "missing").trim().toLowerCase();
  if (status === "rejected") {
    return {
      ok: false,
      failureStage: "rights",
      failureCode: "rights_rejected",
      failureMessage: "Source rights were rejected. Publishing is blocked.",
    };
  }
  if (status !== "declared") {
    return {
      ok: false,
      failureStage: "rights",
      failureCode: "rights_missing",
      failureMessage: RIGHTS_PUBLIC_IS_NOT_REPUBLISH,
    };
  }
  const basis = String(input.rightsBasis ?? "").trim();
  if (!basis) {
    return {
      ok: false,
      failureStage: "rights",
      failureCode: "rights_basis_empty",
      failureMessage: "rights_status=declared requires a non-empty rights_basis note.",
    };
  }
  return { ok: true };
}

export function normalizeRightsStatus(raw: unknown): ExternalBoardRightsStatus {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "declared" || s === "rejected" || s === "missing") return s;
  return "missing";
}
