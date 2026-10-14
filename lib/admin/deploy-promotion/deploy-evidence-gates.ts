/**
 * Evidence-bound TEST verification gates.
 * Manual PASS is forbidden — only server-recorded evidence with result.
 */

export type DeployGateResult = "pass" | "fail" | "not_proven";

export type DeployEvidenceRecord = {
  gateId: string;
  sha: string;
  /** TEST env identifier (e.g. VERCEL_TARGET_ENV / project ref) */
  testEnvId: string;
  result: DeployGateResult;
  /** Opaque evidence id (probe run id / request id) */
  evidenceId: string;
  executedAt: string;
  detail?: string;
  failureReason?: string;
};

export type DeployGateDefinition = {
  gateId: string;
  labelKo: string;
  labelEn: string;
  /** Requires external TEST credentials → may stay NOT_PROVEN */
  requiresExternalCredential: boolean;
};

/** Catalog of known gates (matrix display). */
export const DEPLOY_GATE_CATALOG: readonly DeployGateDefinition[] = [
  {
    gateId: "runtime_isolation",
    labelKo: "TEST 런타임·DB 격리",
    labelEn: "TEST runtime / DB isolation",
    requiresExternalCredential: false,
  },
  {
    gateId: "auth_login_profile",
    labelKo: "로그인·프로필 (ensureAuthProfileForLogin)",
    labelEn: "Login + profile (ensureAuthProfileForLogin)",
    requiresExternalCredential: false,
  },
  {
    gateId: "test_allowlist_enforced",
    labelKo: "TEST allowlist 거부",
    labelEn: "TEST allowlist deny",
    requiresExternalCredential: false,
  },
  {
    gateId: "messenger_rooms_read",
    labelKo: "메신저 방 목록 조회",
    labelEn: "Messenger room list read",
    requiresExternalCredential: false,
  },
  {
    gateId: "messenger_send_receive",
    labelKo: "메신저 실제 송수신",
    labelEn: "Messenger send/receive E2E",
    requiresExternalCredential: true,
  },
  {
    gateId: "community_trade_write",
    labelKo: "커뮤니티·거래 작성",
    labelEn: "Community / trade write",
    requiresExternalCredential: false,
  },
  {
    gateId: "delivery_order_crud",
    labelKo: "배달 주문 CRUD",
    labelEn: "Delivery order CRUD",
    requiresExternalCredential: false,
  },
  {
    gateId: "call_push_sms",
    labelKo: "통화·푸시·SMS",
    labelEn: "Call / push / SMS",
    requiresExternalCredential: true,
  },
] as const;

export type DeployImpactScope =
  | "web_admin_deploy"
  | "web_messenger"
  | "web_full";

/** Required gates by change impact. Unknown impact → web_full (do not exclude). */
export const IMPACT_REQUIRED_GATES: Record<DeployImpactScope, readonly string[]> = {
  web_admin_deploy: [
    "runtime_isolation",
    "auth_login_profile",
    "test_allowlist_enforced",
  ],
  web_messenger: [
    "runtime_isolation",
    "auth_login_profile",
    "test_allowlist_enforced",
    "messenger_rooms_read",
    "messenger_send_receive",
  ],
  web_full: [
    "runtime_isolation",
    "auth_login_profile",
    "test_allowlist_enforced",
    "messenger_rooms_read",
    "messenger_send_receive",
    "community_trade_write",
    "delivery_order_crud",
    "call_push_sms",
  ],
};

export function normalizeImpactScope(raw: unknown): DeployImpactScope {
  if (raw === "web_messenger" || raw === "web_full" || raw === "web_admin_deploy") {
    return raw;
  }
  return "web_full";
}

export function evaluateRequiredGates(input: {
  sha: string;
  impact: DeployImpactScope;
  evidence: DeployEvidenceRecord[];
}): {
  ok: boolean;
  blocking: Array<{ gateId: string; status: DeployGateResult; reason: string }>;
  matrix: Array<{
    gateId: string;
    required: boolean;
    result: DeployGateResult;
    evidenceId: string | null;
    executedAt: string | null;
    detail: string | null;
  }>;
} {
  const required = new Set(IMPACT_REQUIRED_GATES[input.impact]);
  const byGate = new Map<string, DeployEvidenceRecord>();
  for (const e of input.evidence) {
    if (e.sha !== input.sha) continue;
    const prev = byGate.get(e.gateId);
    if (!prev || prev.executedAt < e.executedAt) byGate.set(e.gateId, e);
  }

  const matrix = DEPLOY_GATE_CATALOG.map((g) => {
    const rec = byGate.get(g.gateId);
    return {
      gateId: g.gateId,
      required: required.has(g.gateId),
      result: (rec?.result ?? "not_proven") as DeployGateResult,
      evidenceId: rec?.evidenceId ?? null,
      executedAt: rec?.executedAt ?? null,
      detail: rec?.detail ?? rec?.failureReason ?? null,
    };
  });

  const blocking: Array<{ gateId: string; status: DeployGateResult; reason: string }> = [];
  for (const gateId of required) {
    const rec = byGate.get(gateId);
    if (!rec) {
      blocking.push({
        gateId,
        status: "not_proven",
        reason: "no_evidence",
      });
      continue;
    }
    if (rec.result !== "pass") {
      blocking.push({
        gateId,
        status: rec.result,
        reason: rec.failureReason ?? rec.result,
      });
    }
  }

  return { ok: blocking.length === 0, blocking, matrix };
}
