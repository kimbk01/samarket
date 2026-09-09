/**
 * Admin Data Reset — UI capability vs Production policy exposure.
 * Server execute remains authoritative; this only prevents UX false-availability.
 *
 * Does not change planner/execute contracts.
 */

import {
  isDataResetProductionScopeEnabled,
  resolveDataResetProductionScopeKey,
  type DataResetProductionEnableDecision,
  DATA_RESET_PRODUCTION_ENABLE_MATRIX,
} from "@/lib/admin/data-reset/production-enable-policy";
import type { DataResetDomain, DataResetScope } from "@/lib/admin/data-reset/types";

export type DataResetUiExecutePosture =
  | "available_when_execute_opt_in"
  | "preview_only"
  | "blocked";

export type DataResetUiCapability = {
  domain: DataResetDomain;
  scope: DataResetScope;
  subtype: string | null;
  productionKey: string | null;
  productionEnable: DataResetProductionEnableDecision | "unknown";
  /** Preview API may still run; UI should not imply execute readiness. */
  previewAllowed: boolean;
  executePosture: DataResetUiExecutePosture;
  reasonKo: string;
  reasonEn: string;
};

function matrixDecision(input: {
  domain: DataResetDomain;
  scope: DataResetScope;
  subtype?: string | null;
}): {
  key: string | null;
  productionEnable: DataResetProductionEnableDecision | "unknown";
} {
  const key = resolveDataResetProductionScopeKey(input);
  if (!key) return { key: null, productionEnable: "unknown" };
  const row = DATA_RESET_PRODUCTION_ENABLE_MATRIX.find((r) => r.key === key);
  return { key, productionEnable: row?.productionEnable ?? "unknown" };
}

/**
 * Resolve operator-facing UI posture for a domain/scope selection.
 * Mirrors Production allowlist + hard locks (finance/auth/L2).
 */
export function resolveDataResetUiCapability(input: {
  domain: DataResetDomain;
  scope: DataResetScope;
  subtype?: string | null;
}): DataResetUiCapability {
  const subtype = String(input.subtype ?? "").trim() || null;
  const { key, productionEnable } = matrixDecision({
    domain: input.domain,
    scope: input.scope,
    subtype,
  });

  const base = {
    domain: input.domain,
    scope: input.scope,
    subtype,
    productionKey: key,
    productionEnable,
    previewAllowed: true as boolean,
  };

  // Finance hard reset — preview only forever on this path.
  if (input.domain === "finance") {
    return {
      ...base,
      executePosture: "preview_only",
      reasonKo: "재무 Hard Reset은 미리보기만 가능합니다. 실행은 차단되어 있습니다.",
      reasonEn: "Finance hard reset is preview-only. Execute remains blocked.",
    };
  }

  // Member auth purge — LOCKED.
  if (
    input.domain === "member" &&
    (subtype === "auth_delete" || subtype === "full_user")
  ) {
    return {
      ...base,
      executePosture: "blocked",
      reasonKo: "계정 삭제(Auth purge)는 초기화에서 제외되어 있습니다.",
      reasonEn: "Auth account purge is excluded from Data Reset.",
    };
  }

  // L2 Production scopes — SERVER_REAUTH_NOT_IMPLEMENTED (allowlist BLOCKED).
  if (
    (input.domain === "chat" && input.scope === "type") ||
    (input.domain === "friend" && input.scope === "user")
  ) {
    return {
      ...base,
      executePosture: "blocked",
      reasonKo:
        "현재 운영 환경에서는 이 범위의 초기화를 사용할 수 없습니다. 추가 관리자 재인증 기능이 필요합니다.",
      reasonEn:
        "This reset scope is unavailable in production. Additional admin re-authentication is required.",
    };
  }

  // Explicit Production matrix BLOCKED / EXCLUDED.
  if (productionEnable === "BLOCKED" || productionEnable === "EXCLUDED") {
    return {
      ...base,
      executePosture: "blocked",
      reasonKo: "현재 운영 환경에서는 이 범위의 초기화를 사용할 수 없습니다.",
      reasonEn: "This reset scope is unavailable in the production environment.",
    };
  }

  // Full — preview preserved; destructive runtime NOT_PROVEN (do not market as proven).
  if (input.domain === "full") {
    return {
      ...base,
      executePosture: "available_when_execute_opt_in",
      reasonKo:
        "Full Reset은 미리보기·고위험 작업입니다. Production 실행은 별도 옵트인이 필요하며, 파괴적 실측은 아직 운영 증명되지 않았습니다.",
      reasonEn:
        "Full Reset is preview / high-risk. Production execute needs explicit opt-in; destructive runtime is not operationally proven.",
    };
  }

  // Domain-all / HIGH (L3 confirmation) — policy may ENABLE, but no safe empty Production target.
  if (input.scope === "all") {
    return {
      ...base,
      executePosture: "available_when_execute_opt_in",
      reasonKo:
        "전체 범위는 실데이터가 있을 수 있습니다. Production 실행은 별도 옵트인이 필요하며, 안전한 빈 대상이 없으면 실행하지 마세요.",
      reasonEn:
        "All-scope may include live data. Production execute needs opt-in; do not run without a safe empty target.",
    };
  }

  // Allowlisted singles / gated scopes — execute only when Production EXECUTE opt-in.
  const enabled = isDataResetProductionScopeEnabled({
    domain: input.domain,
    scope: input.scope,
    subtype,
  });
  if (!enabled && key) {
    return {
      ...base,
      executePosture: "blocked",
      reasonKo: "현재 운영 환경에서는 이 범위의 초기화를 사용할 수 없습니다.",
      reasonEn: "This reset scope is unavailable in the production environment.",
    };
  }

  return {
    ...base,
    executePosture: "available_when_execute_opt_in",
    reasonKo: "Production 실행은 기본 비활성입니다. 명시적 운영 옵트인이 있을 때만 실행할 수 있습니다.",
    reasonEn: "Production execute is off by default. Explicit operational opt-in is required.",
  };
}

/** True when UI must not offer Execute even if a crafted plan claimed executeAllowed. */
export function dataResetUiExecuteBlocked(cap: DataResetUiCapability): boolean {
  return cap.executePosture === "blocked" || cap.executePosture === "preview_only";
}
