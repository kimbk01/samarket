import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidDibayIdFormat, normalizeDibayIdInput } from "@/lib/auth/dibay-id-policy";

export async function reserveDibayIdForUser(
  sb: SupabaseClient,
  userId: string,
  rawInput: unknown
): Promise<{ ok: true; available: boolean; normalized: string } | { ok: false; error: string; status: number }> {
  const normalized = normalizeDibayIdInput(
    typeof rawInput === "object" && rawInput !== null
      ? (rawInput as { dibay_id?: unknown; username?: unknown }).dibay_id ??
          (rawInput as { username?: unknown }).username
      : rawInput
  );
  if (!normalized) {
    return { ok: false, error: "dibay_id_required", status: 400 };
  }
  if (!isValidDibayIdFormat(normalized)) {
    return { ok: false, error: "dibay_id_invalid_format", status: 400 };
  }

  const { data: dibayHits, error: dibayErr } = await sb
    .from("profiles")
    .select("id, dibay_id")
    .ilike("dibay_id", normalized)
    .limit(3);
  if (dibayErr) {
    return { ok: false, error: dibayErr.message, status: 500 };
  }

  const { data: usernameHits, error: userErr } = await sb
    .from("profiles")
    .select("id, username, username_confirmed")
    .ilike("username", normalized)
    .limit(3);
  if (userErr) {
    return { ok: false, error: userErr.message, status: 500 };
  }

  const takenByOther =
    (dibayHits ?? []).some((r) => String((r as { id?: string }).id ?? "") !== userId) ||
    (usernameHits ?? []).some(
      (r) =>
        String((r as { id?: string }).id ?? "") !== userId &&
        (r as { username_confirmed?: boolean }).username_confirmed === true
    );

  return { ok: true, available: !takenByOther, normalized };
}

type RpcResult = {
  ok?: boolean;
  error?: string;
  dibay_id?: string;
  idempotent?: boolean;
};

export async function confirmDibayIdForUser(
  sb: SupabaseClient,
  userId: string,
  rawInput: unknown
): Promise<
  | { ok: true; dibay_id: string; idempotent?: boolean }
  | { ok: false; error: string; status: number }
> {
  const normalized = normalizeDibayIdInput(
    typeof rawInput === "object" && rawInput !== null
      ? (rawInput as { dibay_id?: unknown; username?: unknown }).dibay_id ??
          (rawInput as { username?: unknown }).username
      : rawInput
  );
  if (!normalized) {
    return { ok: false, error: "dibay_id_required", status: 400 };
  }

  const { data, error } = await sb.rpc("confirm_dibay_id", {
    p_user_id: userId,
    p_dibay_id: normalized,
  });

  if (error) {
    const msg = error.message ?? "confirm_failed";
    if (msg.includes("confirm_dibay_id") || msg.includes("does not exist")) {
      return { ok: false, error: "confirm_rpc_unavailable", status: 503 };
    }
    return { ok: false, error: msg, status: 500 };
  }

  const result = (data ?? {}) as RpcResult;
  if (!result.ok) {
    const code = String(result.error ?? "confirm_failed");
    const status =
      code === "terms_required"
        ? 403
        : code === "dibay_id_taken" || code === "dibay_id_already_locked"
          ? 409
          : 400;
    return { ok: false, error: code, status };
  }

  return {
    ok: true,
    dibay_id: String(result.dibay_id ?? normalized),
    idempotent: result.idempotent === true,
  };
}
