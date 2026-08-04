/**
 * Auth lifecycle wall-clock + stage trace (instrumentation only).
 * Does not change login control flow. Never logs tokens/cookies/JWT/email.
 */
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import { resolveOAuthRoutingShellPlatform } from "@/lib/platform/capacitor-native";

export type AuthLifecycleStage =
  | "login_button_tapped"
  | "routing_decision_completed"
  | "provider_launch_requested"
  | "provider_ui_presented"
  | "provider_credential_received"
  | "exchange_requested"
  | "server_session_established"
  | "cookie_handoff_completed"
  | "client_session_visible"
  | "profile_resolved"
  | "onboarding_resolved"
  | "navigation_committed"
  | "interaction_ready";

export type AuthLifecycleResult = "ok" | "fail" | "cancel" | "in_progress";

type AuthLifecycleCounters = {
  onAuthStateChange: number;
  callbackRoute: number;
  nativeExchange: number;
  clientSessionSync: number;
  profileResolution: number;
  onboardingResolution: number;
  finishClientAuthLogin: number;
  navigation: number;
  fullDocumentRedirect: number;
};

type AuthLifecycleFlow = {
  authFlowId: string;
  platform: string;
  provider: string;
  flowKind: string;
  startedAtMs: number;
  lastStage: AuthLifecycleStage | null;
  result: AuthLifecycleResult;
  errorCode: string | null;
  counters: AuthLifecycleCounters;
};

const SENSITIVE_KEY =
  /^(identitytoken|id_token|accesstoken|access_token|refreshtoken|refresh_token|authorization|authorizationcode|code|cookie|jwt|nonce|password|secret|service.?role|email|userid|user_id|useridentifier|sub)$/i;

let activeFlow: AuthLifecycleFlow | null = null;

function emptyCounters(): AuthLifecycleCounters {
  return {
    onAuthStateChange: 0,
    callbackRoute: 0,
    nativeExchange: 0,
    clientSessionSync: 0,
    profileResolution: 0,
    onboardingResolution: 0,
    finishClientAuthLogin: 0,
    navigation: 0,
    fullDocumentRedirect: 0,
  };
}

function newAuthFlowId(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `af_${rand}`;
}

export function redactAuthLifecycleDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (SENSITIVE_KEY.test(key.replace(/[^a-zA-Z0-9_]/g, ""))) {
      out[key] = typeof value === "string" && value.length > 0 ? `[redacted:len=${value.length}]` : "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.split(".").length === 3 && value.length > 40) {
      out[key] = `[redacted:jwt_like:len=${value.length}]`;
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      out[key] = redactAuthLifecycleDetail(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function getActiveAuthFlowId(): string | null {
  return activeFlow?.authFlowId ?? null;
}

export function getActiveAuthLifecycleFlowForTests(): AuthLifecycleFlow | null {
  return activeFlow;
}

export function resetAuthLifecycleForTests(): void {
  activeFlow = null;
}

export function beginAuthLifecycleFlow(input: {
  provider: string;
  flowKind?: string;
  platform?: string | null;
}): string {
  const platform =
    input.platform?.trim()
    || resolveOAuthRoutingShellPlatform()
    || (typeof navigator !== "undefined" ? "web" : "unknown");
  activeFlow = {
    authFlowId: newAuthFlowId(),
    platform,
    provider: input.provider,
    flowKind: input.flowKind ?? "oauth_login",
    startedAtMs: Date.now(),
    lastStage: null,
    result: "in_progress",
    errorCode: null,
    counters: emptyCounters(),
  };
  return activeFlow.authFlowId;
}

export function bumpAuthLifecycleCounter(key: keyof AuthLifecycleCounters): void {
  if (!activeFlow) return;
  activeFlow.counters[key] += 1;
}

export function markAuthLifecycleStage(
  stage: AuthLifecycleStage,
  detail: Record<string, unknown> = {},
): void {
  if (!activeFlow) return;
  activeFlow.lastStage = stage;
  const elapsedMs = Date.now() - activeFlow.startedAtMs;
  const safe = redactAuthLifecycleDetail(detail);
  logOAuthNativeEvent("auth_lifecycle", {
    authFlowId: activeFlow.authFlowId,
    platform: activeFlow.platform,
    provider: activeFlow.provider,
    flowKind: activeFlow.flowKind,
    stage,
    elapsedMs,
    result: activeFlow.result,
    errorCode: activeFlow.errorCode,
    counters: { ...activeFlow.counters },
    ...safe,
  });
}

export function completeAuthLifecycle(
  result: Exclude<AuthLifecycleResult, "in_progress">,
  detail: Record<string, unknown> = {},
): void {
  if (!activeFlow) return;
  activeFlow.result = result;
  if (typeof detail.errorCode === "string") {
    activeFlow.errorCode = detail.errorCode;
  }
  const elapsedMs = Date.now() - activeFlow.startedAtMs;
  logOAuthNativeEvent("auth_lifecycle_complete", {
    authFlowId: activeFlow.authFlowId,
    platform: activeFlow.platform,
    provider: activeFlow.provider,
    flowKind: activeFlow.flowKind,
    lastStage: activeFlow.lastStage,
    elapsedMs,
    result,
    errorCode: activeFlow.errorCode,
    counters: { ...activeFlow.counters },
    ...redactAuthLifecycleDetail(detail),
  });
}

export function failAuthLifecycle(errorCode: string, detail: Record<string, unknown> = {}): void {
  completeAuthLifecycle("fail", { ...detail, errorCode });
}

export function cancelAuthLifecycle(detail: Record<string, unknown> = {}): void {
  completeAuthLifecycle("cancel", detail);
}

export function authLifecycleExchangeHeaders(): Record<string, string> {
  const id = getActiveAuthFlowId();
  if (!id) return {};
  return { "x-dibay-auth-flow-id": id };
}
