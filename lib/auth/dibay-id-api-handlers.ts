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

  /**
   * 회원 아이디 v3 재감사 E1·D6: 중복 판정은 DB `dibay_id_candidate_error` 하나 — 확정(confirm_dibay_id)과 같은 함수.
   * 다른 회원의 회원 아이디·기본 아이디·확정 username(점·밑줄 무시 포함)·dibay 접두를 모두 본다.
   */
  const { data: candidateError, error: rpcError } = await sb.rpc("dibay_id_candidate_error", {
    p_user_id: userId,
    p_normalized: normalized,
  });
  if (rpcError) {
    return { ok: false, error: "dibay_id_check_failed", status: 500 };
  }
  if (candidateError === "dibay_id_reserved_prefix") {
    return { ok: false, error: "dibay_id_invalid_format", status: 400 };
  }
  const takenByOther = candidateError === "dibay_id_taken";
  const similarByOther = candidateError === "dibay_id_similar_taken";

  return { ok: true, available: !takenByOther && !similarByOther, normalized };
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
        : code === "dibay_id_taken" ||
            code === "dibay_id_similar_taken" ||
            code === "dibay_id_already_locked" ||
            code === "dibay_id_change_limit"
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
