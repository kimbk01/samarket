/**
 * Non-behavioral durable evidence for POST /api/me/devices/register.
 * Logs only — never changes control flow, activation policy, or DB writes.
 * Token plaintext and PII beyond auth user id / device_id are forbidden.
 */

export type DeviceRegisterAuditStage =
  | "request"
  | "other_user_deactivate"
  | "old_token_deactivate"
  | "token_wipe_start"
  | "token_wipe_result"
  | "active_count_start"
  | "active_count_result"
  | "activate_policy"
  | "upsert_start"
  | "upsert_result"
  | "thrown"
  | "response";

export type DeviceRegisterAuditPayload = {
  stage: DeviceRegisterAuditStage;
  request_ts: string;
  auth_user_id: string;
  device_id: string;
  provider: string;
  platform?: string;
  environment: string;
  token_suffix?: string;
  token_len?: number;
  activate_row?: boolean;
  other_user_deactivate_err?: string | null;
  other_user_deactivate_code?: string | null;
  old_token_deactivate_err?: string | null;
  old_token_deactivate_code?: string | null;
  wipe_err?: string | null;
  wipe_code?: string | null;
  wipe_ok?: boolean;
  count_err?: string | null;
  count_code?: string | null;
  active_count?: number | null;
  count_ok?: boolean;
  upsert_err?: string | null;
  upsert_code?: string | null;
  upsert_ok?: boolean;
  row_id?: string | null;
  is_active?: boolean | null;
  last_seen_at?: string | null;
  http_status?: number;
  response_category?: string;
  is_etimedout?: boolean;
  thrown_name?: string | null;
  thrown_code?: string | null;
  thrown_message?: string | null;
  aggregate_error_causes?: string[] | null;
};

function tokenSuffix(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return t;
  return t.slice(-12);
}

export function buildDeviceRegisterTokenEvidence(pushToken: string): {
  token_suffix: string;
  token_len: number;
} {
  return { token_suffix: tokenSuffix(pushToken), token_len: pushToken.trim().length };
}

function readErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number" ? String(code) : null;
}

function readErrorMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message || null;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

/** Extract ETIMEDOUT / AggregateError cause strings without dumping sockets or tokens. */
export function describeThrownForDeviceRegisterAudit(err: unknown): {
  is_etimedout: boolean;
  thrown_name: string | null;
  thrown_code: string | null;
  thrown_message: string | null;
  aggregate_error_causes: string[] | null;
} {
  const name = err instanceof Error ? err.name : typeof err;
  const code = readErrorCode(err);
  const message = readErrorMessage(err);
  const blob = `${name ?? ""} ${code ?? ""} ${message ?? ""}`;
  const isEtimedout = /\bETIMEDOUT\b/i.test(blob);

  let causes: string[] | null = null;
  if (err && typeof err === "object" && Array.isArray((err as { errors?: unknown }).errors)) {
    const nested = (err as { errors: unknown[] }).errors;
    causes = nested.slice(0, 8).map((item) => {
      const nestedName = item instanceof Error ? item.name : typeof item;
      const nestedCode = readErrorCode(item);
      const nestedMessage = readErrorMessage(item);
      return [nestedName, nestedCode, nestedMessage].filter(Boolean).join(":");
    });
    if (causes.some((c) => /\bETIMEDOUT\b/i.test(c))) {
      return {
        is_etimedout: true,
        thrown_name: typeof name === "string" ? name : null,
        thrown_code: code,
        thrown_message: message,
        aggregate_error_causes: causes,
      };
    }
  }

  return {
    is_etimedout: isEtimedout,
    thrown_name: typeof name === "string" ? name : null,
    thrown_code: code,
    thrown_message: message,
    aggregate_error_causes: causes,
  };
}

export function logDeviceRegisterAudit(payload: DeviceRegisterAuditPayload): void {
  // Stable marker for Vercel / Production log scrape.
  console.info("[devices/register/audit]", JSON.stringify(payload));
}
