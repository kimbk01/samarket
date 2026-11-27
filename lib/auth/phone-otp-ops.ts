import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPhoneOtpEnvEnableConflictPresent,
  loadAuthPhoneSettings,
  type AuthPhoneSettings,
} from "@/lib/auth/auth-phone-settings";
import { isPhoneOtpHashSecretConfigured } from "@/lib/auth/phone-otp-hash-secret";
import { requireSemaphoreSmsEnv } from "@/lib/env/semaphore-sms";
import {
  probeSemaphoreAccount,
  type SemaphoreAccountProbeResult,
} from "@/lib/auth/semaphore-account";
import { appendAuditLog } from "@/lib/audit/append-audit-log";

export type PhoneOtpOpsHealthStatus =
  | "running_ok"
  | "admin_stopped"
  | "config_error"
  | "low_balance"
  | "provider_down"
  | "send_limited"
  | "unverified";

export type PhoneOtpSecurityGate = {
  ok: boolean;
  missing: string[];
  envEnableConflict: boolean;
  hashSecretConfigured: boolean;
  semaphoreKeyConfigured: boolean;
};

export type PhoneOtpDeliveryEventRow = {
  id: string;
  outcome: "success" | "failed";
  provider_code: string | null;
  provider_message_id: string | null;
  error_summary: string | null;
  created_at: string;
  user_id: string | null;
};

export type PhoneOtpOpsSnapshot = {
  settings: AuthPhoneSettings;
  security: PhoneOtpSecurityGate;
  health: PhoneOtpOpsHealthStatus;
  healthReasons: string[];
  canEnable: boolean;
  enableBlockers: string[];
  provider: SemaphoreAccountProbeResult | null;
  recentDeliveries: PhoneOtpDeliveryEventRow[];
  dashboardUrl: string;
  creditLowThreshold: number;
};

function readCreditLowThreshold(): number {
  const raw = process.env.PHONE_OTP_CREDIT_LOW_THRESHOLD?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function evaluatePhoneOtpSecurityGate(): PhoneOtpSecurityGate {
  const hashSecretConfigured = isPhoneOtpHashSecretConfigured();
  const semaphore = requireSemaphoreSmsEnv();
  const semaphoreKeyConfigured = semaphore.ok;
  const envEnableConflict = isPhoneOtpEnvEnableConflictPresent();
  const missing: string[] = [];
  if (!hashSecretConfigured) missing.push("PHONE_OTP_HASH_SECRET");
  if (!semaphoreKeyConfigured) missing.push("SEMAPHORE_API_KEY");
  if (envEnableConflict) missing.push("PHONE_OTP_ENABLED_CONFLICT");
  return {
    ok: missing.length === 0,
    missing,
    envEnableConflict,
    hashSecretConfigured,
    semaphoreKeyConfigured,
  };
}

export function derivePhoneOtpOpsHealth(input: {
  enabled: boolean;
  security: PhoneOtpSecurityGate;
  provider: SemaphoreAccountProbeResult | null;
  creditLowThreshold: number;
}): { health: PhoneOtpOpsHealthStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.enabled) {
    return { health: "admin_stopped", reasons: ["admin_disabled"] };
  }
  if (!input.security.ok) {
    reasons.push(...input.security.missing);
    return { health: "config_error", reasons };
  }
  const provider = input.provider;
  if (!provider) {
    return { health: "unverified", reasons: ["provider_not_probed"] };
  }
  if (!provider.ok) {
    if (provider.kind === "rate_limited") {
      return { health: "send_limited", reasons: ["semaphore_rate_limited"] };
    }
    if (provider.kind === "missing_key" || provider.kind === "auth_rejected") {
      return { health: "config_error", reasons: [provider.kind] };
    }
    if (provider.kind === "network_error" || provider.kind === "unexpected_shape") {
      return { health: "unverified", reasons: [provider.kind] };
    }
    return { health: "provider_down", reasons: [provider.kind] };
  }
  if (provider.creditBalance != null && provider.creditBalance <= input.creditLowThreshold) {
    return {
      health: "low_balance",
      reasons: [`credit_balance=${provider.creditBalance}`],
    };
  }
  const status = String(provider.status ?? "").toLowerCase();
  if (status && status !== "active") {
    return { health: "provider_down", reasons: [`account_status=${provider.status}`] };
  }
  return { health: "running_ok", reasons: [] };
}

export async function loadPhoneOtpOpsSnapshot(
  sb: SupabaseClient,
  opts?: { probeProvider?: boolean; forceProbe?: boolean },
): Promise<PhoneOtpOpsSnapshot> {
  const settings = await loadAuthPhoneSettings();
  const security = evaluatePhoneOtpSecurityGate();
  const creditLowThreshold = readCreditLowThreshold();
  let provider: SemaphoreAccountProbeResult | null = null;
  if (opts?.probeProvider !== false) {
    provider = await probeSemaphoreAccount({ force: opts?.forceProbe === true });
  }
  const derived = derivePhoneOtpOpsHealth({
    enabled: settings.enabled === true,
    security,
    provider,
    creditLowThreshold,
  });
  const enableBlockers = security.missing.filter((m) => m !== "PHONE_OTP_ENABLED_CONFLICT" || true);
  // Conflict always blocks enable; same as missing list.
  const canEnable = security.ok;

  let recentDeliveries: PhoneOtpDeliveryEventRow[] = [];
  try {
    const { data } = await sb
      .from("phone_otp_delivery_events")
      .select("id, outcome, provider_code, provider_message_id, error_summary, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(20);
    recentDeliveries = (data ?? []) as PhoneOtpDeliveryEventRow[];
  } catch {
    recentDeliveries = [];
  }

  return {
    settings,
    security,
    health: derived.health,
    healthReasons: derived.reasons,
    canEnable,
    enableBlockers: canEnable ? [] : enableBlockers,
    provider,
    recentDeliveries,
    dashboardUrl: "https://semaphore.co/dashboard",
    creditLowThreshold,
  };
}

export async function invalidateOpenPhoneOtpChallenges(sb: SupabaseClient): Promise<number> {
  const nowIso = new Date(Date.now() - 1000).toISOString();
  const { data, error } = await sb
    .from("phone_otp_challenges")
    .update({ otp_expires_at: nowIso, updated_at: new Date().toISOString() })
    .is("verified_at", null)
    .select("user_id");
  if (error) return 0;
  return Array.isArray(data) ? data.length : 0;
}

export type SetPhoneOtpEnabledResult =
  | {
      ok: true;
      enabled: boolean;
      rowVersion: number;
      invalidatedChallenges: number;
    }
  | {
      ok: false;
      status: number;
      code:
        | "forbidden_security"
        | "version_conflict"
        | "settings_missing"
        | "invalid_reason"
        | "server_error"
        | "rpc_unavailable";
      message: string;
      currentVersion?: number;
      blockers?: string[];
    };

/**
 * Admin ON/OFF — **RPC only** (`admin_set_auth_phone_otp_enabled`).
 * Settings update + open-challenge invalidate run in one DB transaction inside the RPC.
 * RPC missing/failure → fail-closed: **no** TypeScript fallback writes to settings or challenges.
 * Never auto-toggles from provider health. Never mutates verified member profiles.
 */
export async function setAuthPhoneOtpEnabled(input: {
  sb: SupabaseClient;
  actorId: string;
  enabled: boolean;
  reason: string;
  expectedVersion: number;
}): Promise<SetPhoneOtpEnabledResult> {
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 2 || reason.length > 500) {
    return {
      ok: false,
      status: 400,
      code: "invalid_reason",
      message: "invalid_reason",
    };
  }

  if (input.enabled) {
    const security = evaluatePhoneOtpSecurityGate();
    if (!security.ok) {
      return {
        ok: false,
        status: 409,
        code: "forbidden_security",
        message: "forbidden_security",
        blockers: security.missing,
      };
    }
  }

  const before = await loadAuthPhoneSettings();

  const { data: rpcData, error: rpcError } = await input.sb.rpc("admin_set_auth_phone_otp_enabled", {
    p_enabled: input.enabled,
    p_reason: reason,
    p_actor_id: input.actorId,
    p_expected_version: input.expectedVersion,
  });

  if (rpcError) {
    console.error("[phone-otp-ops] admin_set_auth_phone_otp_enabled rpc failed", { message: rpcError.message });
    return {
      ok: false,
      status: 503,
      code: "rpc_unavailable",
      message: "rpc_unavailable",
    };
  }

  if (!rpcData || typeof rpcData !== "object") {
    return {
      ok: false,
      status: 500,
      code: "server_error",
      message: "server_error",
    };
  }

  const row = rpcData as Record<string, unknown>;
  if (row.ok === false && row.error === "version_conflict") {
    return {
      ok: false,
      status: 409,
      code: "version_conflict",
      message: "version_conflict",
      currentVersion: Number(row.current_version) || undefined,
    };
  }
  if (row.ok === false && row.error === "settings_missing") {
    return {
      ok: false,
      status: 500,
      code: "settings_missing",
      message: "settings_missing",
    };
  }
  if (row.ok !== true) {
    return {
      ok: false,
      status: 500,
      code: "server_error",
      message: "server_error",
    };
  }

  const after = await loadAuthPhoneSettings();
  void appendAuditLog(input.sb, {
    actor_type: "admin",
    actor_id: input.actorId,
    target_type: "auth_phone_settings",
    target_id: after.id ?? "PH",
    action: input.enabled ? "admin_phone_otp_enable" : "admin_phone_otp_disable",
    before_json: {
      enabled: before.enabled,
      row_version: before.row_version ?? 1,
    },
    after_json: {
      enabled: after.enabled,
      row_version: after.row_version ?? Number(row.row_version) ?? null,
      reason,
      invalidated_challenges: Number(row.invalidated_challenges) || 0,
    },
  });
  return {
    ok: true,
    enabled: input.enabled,
    rowVersion: Number(row.row_version) || after.row_version || input.expectedVersion + 1,
    invalidatedChallenges: Number(row.invalidated_challenges) || 0,
  };
}

export async function recordPhoneOtpDeliveryEvent(
  sb: SupabaseClient,
  input: {
    userId: string;
    outcome: "success" | "failed";
    providerCode?: string | null;
    providerMessageId?: string | null;
    errorSummary?: string | null;
    /** 기본 member(회원 인증) · 매장 전화 인증은 store_apply / store_phone_change */
    purpose?: "member" | "store_apply" | "store_phone_change";
  },
): Promise<void> {
  try {
    await sb.from("phone_otp_delivery_events").insert({
      user_id: input.userId,
      ...(input.purpose && input.purpose !== "member" ? { purpose: input.purpose } : {}),
      outcome: input.outcome,
      provider_code: input.providerCode ?? null,
      provider_message_id: input.providerMessageId ?? null,
      error_summary: input.errorSummary ? String(input.errorSummary).slice(0, 300) : null,
    });
  } catch {
    // table may be absent pre-migration — ignore
  }
}
