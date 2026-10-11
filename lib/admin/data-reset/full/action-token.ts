/**
 * Full data reset — signed, single-use action tokens.
 *
 * Issued only after a successful re-authentication (password, and AAL2 when the admin has MFA
 * enrolled). A token is bound to: action, actor, window / plan id, plan hash; it expires after
 * 5 minutes and is consumed atomically (INSERT into public.data_reset_action_claims, nonce PK),
 * so a replay or a parallel second request is refused by the database.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readDataResetActionSecret } from "@/lib/admin/data-reset/types";

export const FULL_RESET_TOKEN_TTL_MS = 5 * 60 * 1000;

export const FULL_RESET_TOKEN_ACTIONS = ["decide_window", "confirm_plan", "approve_plan", "start_run"] as const;
export type FullResetTokenAction = (typeof FULL_RESET_TOKEN_ACTIONS)[number];

export type FullResetTokenBinding = {
  action: FullResetTokenAction;
  actorUserId: string;
  windowId?: string | null;
  planId?: string | null;
  planHash?: string | null;
};

type Payload = {
  v: 2;
  act: FullResetTokenAction;
  sub: string;
  win: string | null;
  plan: string | null;
  hash: string | null;
  nonce: string;
  exp: number;
};

function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(`dibay_full_reset_v2.${body}`).digest("base64url");
}

export function issueFullResetActionToken(
  binding: FullResetTokenBinding,
  nowMs: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env
): { ok: true; token: string; expiresAt: string } | { ok: false; reason: string } {
  const secret = readDataResetActionSecret(env);
  if (!secret) return { ok: false, reason: "action_secret_not_configured" };
  const payload: Payload = {
    v: 2,
    act: binding.action,
    sub: binding.actorUserId,
    win: binding.windowId ?? null,
    plan: binding.planId ?? null,
    hash: binding.planHash ?? null,
    nonce: randomBytes(18).toString("base64url"),
    exp: nowMs + FULL_RESET_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { ok: true, token: `${body}.${sign(secret, body)}`, expiresAt: new Date(payload.exp).toISOString() };
}

/** Signature + expiry + binding check (no DB). */
export function verifyFullResetActionToken(
  token: string,
  binding: FullResetTokenBinding,
  nowMs: number = Date.now(),
  env: NodeJS.ProcessEnv = process.env
): { ok: true; nonce: string } | { ok: false; reason: string } {
  const secret = readDataResetActionSecret(env);
  if (!secret) return { ok: false, reason: "action_secret_not_configured" };
  const [body, mac, extra] = String(token ?? "").split(".");
  if (!body || !mac || extra !== undefined) return { ok: false, reason: "token_malformed" };
  const expected = Buffer.from(sign(secret, body));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reason: "token_signature_invalid" };
  let p: Payload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
  } catch {
    return { ok: false, reason: "token_malformed" };
  }
  if (p.v !== 2) return { ok: false, reason: "token_version" };
  if (!Number.isFinite(p.exp) || p.exp <= nowMs) return { ok: false, reason: "token_expired" };
  if (p.act !== binding.action) return { ok: false, reason: "token_action_mismatch" };
  if (p.sub !== binding.actorUserId) return { ok: false, reason: "token_actor_mismatch" };
  if ((p.win ?? null) !== (binding.windowId ?? null)) return { ok: false, reason: "token_window_mismatch" };
  if ((p.plan ?? null) !== (binding.planId ?? null)) return { ok: false, reason: "token_plan_mismatch" };
  if ((p.hash ?? null) !== (binding.planHash ?? null)) return { ok: false, reason: "token_hash_mismatch" };
  return { ok: true, nonce: p.nonce };
}

/** Verify, then consume atomically. Replays / parallel duplicates fail on the nonce primary key. */
export async function consumeFullResetActionToken(
  sb: SupabaseClient,
  token: string,
  binding: FullResetTokenBinding,
  nowMs: number = Date.now()
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const v = verifyFullResetActionToken(token, binding, nowMs);
  if (!v.ok) return v;
  const { error } = await sb.from("data_reset_action_claims").insert({
    nonce: v.nonce,
    action: binding.action,
    plan_id: binding.planId ?? null,
    window_id: binding.windowId ?? null,
    actor_user_id: binding.actorUserId,
  });
  if (error) {
    const dup = error.code === "23505" || /duplicate|unique/i.test(String(error.message ?? ""));
    return { ok: false, reason: dup ? "token_replay" : "token_claim_failed" };
  }
  return { ok: true };
}
