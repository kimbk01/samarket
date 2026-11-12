/**
 * /api/admin/moim/policies — 모임 운영 정책 (설계 moim §8 「운영 정책 설정」 · D6 값은 여기서 관리). 권한 키 `moim`.
 * GET → { policies } · PUT { patch: { <숫자 항목>: number|null, banned_words?: string[] }, expectedUpdatedAt, reason(필수) }
 * 빈 값(null) = 검사 안 함. 낙관적 잠금 — 다르면 409.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  MOIM_ADMIN_BANNED_WORD_MAX_LEN,
  MOIM_ADMIN_BANNED_WORDS_MAX,
  MOIM_ADMIN_POLICY_INT_KEYS,
} from "@/lib/admin/moim/moim-admin-contract";
import { loadAdminMoimPolicies } from "@/lib/admin/moim/moim-admin-queries.server";
import { moimAdminBad, moimAdminJson, moimAdminReadError, moimAdminReason, moimAdminRpcResponse } from "@/lib/admin/moim/moim-admin-route.server";
import { moimAdminPoliciesSave } from "@/lib/moim/server/moim-rpc.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const res = await loadAdminMoimPolicies(gate.sb);
  if (!res.ok) return moimAdminReadError(res.error);
  return NextResponse.json(res);
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("moim");
  if (!gate.ok) return gate.response;
  const body = await moimAdminJson<{ patch?: Record<string, unknown>; expectedUpdatedAt?: unknown; reason?: unknown }>(req);
  const reason = moimAdminReason(body?.reason);
  if (!reason) return moimAdminBad("moim_admin_reason_required");
  const expected = typeof body?.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : "";
  if (!expected) return moimAdminBad("moim_conflict", 409);
  const raw = body?.patch && typeof body.patch === "object" ? body.patch : null;
  if (!raw) return moimAdminBad();
  const patch: Record<string, number | null | string[]> = {};
  for (const key of MOIM_ADMIN_POLICY_INT_KEYS) {
    if (!(key in raw)) continue;
    const v = raw[key];
    if (v === null || v === "") patch[key] = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return moimAdminBad("moim_policy_invalid");
      patch[key] = n;
    }
  }
  if ("banned_words" in raw) {
    if (!Array.isArray(raw.banned_words)) return moimAdminBad("moim_policy_invalid");
    const words = raw.banned_words
      .filter((w): w is string => typeof w === "string")
      .map((w) => w.trim())
      .filter((w) => w.length > 0);
    if (words.length > MOIM_ADMIN_BANNED_WORDS_MAX || words.some((w) => w.length > MOIM_ADMIN_BANNED_WORD_MAX_LEN)) {
      return moimAdminBad("moim_policy_invalid");
    }
    patch.banned_words = [...new Set(words)];
  }
  if (Object.keys(patch).length === 0) return moimAdminBad();
  return moimAdminRpcResponse(await moimAdminPoliciesSave(gate.actor.userId, patch, expected, reason, gate.sb));
}
