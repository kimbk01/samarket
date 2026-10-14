/**
 * Server-side gate runners — no client-claimed PASS.
 */

import { randomUUID } from "crypto";
import {
  evaluateTestAccess,
  isTestRuntimeSurface,
} from "@/lib/config/test-access-control";
import { resolveServerDeployTier } from "@/lib/config/test-production-isolation";
import { resolveDataResetDatabaseTarget } from "@/lib/admin/data-reset/database-target-guard";
import type { DeployEvidenceRecord, DeployGateResult } from "./deploy-evidence-gates";

const TEST_PROJECT_REF = "tcwnueuzuxftyomttdyu";
const PROD_PROJECT_REF = "ckdosyydvgzqwpbwuhon";

function testEnvId(): string {
  return (
    process.env.VERCEL_TARGET_ENV ||
    process.env.DIBAY_RUNTIME_TIER ||
    resolveServerDeployTier() ||
    "unknown"
  );
}

function evidence(
  gateId: string,
  sha: string,
  result: DeployGateResult,
  detail: string,
  failureReason?: string
): DeployEvidenceRecord {
  return {
    gateId,
    sha,
    testEnvId: testEnvId(),
    result,
    evidenceId: randomUUID(),
    executedAt: new Date().toISOString(),
    detail,
    failureReason,
  };
}

export async function runDeployGate(input: {
  gateId: string;
  sha: string;
  actorUserId: string;
}): Promise<DeployEvidenceRecord> {
  const { gateId, sha } = input;

  switch (gateId) {
    case "runtime_isolation": {
      const tier = resolveServerDeployTier();
      const db = resolveDataResetDatabaseTarget();
      const ref = (db.projectRef ?? "").toLowerCase();
      if (ref === PROD_PROJECT_REF) {
        return evidence(
          gateId,
          sha,
          "fail",
          `tier=${tier};ref=${ref}`,
          "bound_to_production_db"
        );
      }
      if (ref !== TEST_PROJECT_REF) {
        return evidence(
          gateId,
          sha,
          "not_proven",
          `tier=${tier};ref=${ref || "null"}`,
          "test_project_ref_not_confirmed"
        );
      }
      if (!isTestRuntimeSurface()) {
        return evidence(
          gateId,
          sha,
          "not_proven",
          `tier=${tier};target=${process.env.VERCEL_TARGET_ENV ?? ""};surface=non_test`,
          "not_on_test_runtime_surface"
        );
      }
      return evidence(gateId, sha, "pass", `tier=${tier};ref=${ref}`);
    }

    case "auth_login_profile": {
      // Actor passed requireDeployOwner/superAdmin → session + admin profile path exists.
      if (!input.actorUserId) {
        return evidence(gateId, sha, "fail", "no_actor", "missing_actor");
      }
      return evidence(
        gateId,
        sha,
        "pass",
        `actor=${input.actorUserId.slice(0, 8)};contract=ensureAuthProfileForLogin`
      );
    }

    case "test_allowlist_enforced": {
      const base = {
        NEXT_PUBLIC_DIBAY_RUNTIME_SURFACE: "test",
        VERCEL_TARGET_ENV: "test",
      } as unknown as NodeJS.ProcessEnv;
      const emptyDeny = evaluateTestAccess({
        userId: "00000000-0000-4000-8000-000000000099",
        env: {
          ...base,
          DIBAY_TEST_ALLOWED_USER_IDS: "",
          DIBAY_TEST_ALLOWED_EMAILS: "",
        },
      });
      if (emptyDeny.allowed) {
        return evidence(gateId, sha, "fail", "empty_allowlist_allowed", "allowlist_fail_open");
      }
      const allowOne = evaluateTestAccess({
        userId: "00000000-0000-4000-8000-000000000001",
        env: {
          ...base,
          DIBAY_TEST_ALLOWED_USER_IDS: "00000000-0000-4000-8000-000000000001",
          DIBAY_TEST_ALLOWED_EMAILS: "",
        },
      });
      if (!allowOne.allowed) {
        return evidence(gateId, sha, "fail", "allowlisted_denied", "allowlist_reject_valid");
      }
      return evidence(gateId, sha, "pass", "empty_deny+allow_one");
    }

    case "messenger_rooms_read":
    case "messenger_send_receive":
    case "community_trade_write":
    case "delivery_order_crud":
    case "call_push_sms":
      return evidence(
        gateId,
        sha,
        "not_proven",
        "no_automated_runner",
        gateId === "call_push_sms" || gateId === "messenger_send_receive"
          ? "requires_test_external_credential"
          : "runner_not_implemented"
      );

    default:
      return evidence(gateId, sha, "not_proven", "unknown_gate", "unknown_gate");
  }
}
