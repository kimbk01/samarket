#!/usr/bin/env node
/**
 * Read-only Kakao profile identity metadata dry-run.
 * Does NOT mutate Production.
 *
 * Usage: node --env-file=.env.local scripts/qa/kakao-profile-identity-metadata-dry-run.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("MISSING_CREDS");
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const hash = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 12);

const { data: rows, error } = await sb
  .from("user_auth_identities")
  .select("id,user_id,provider,provider_user_id,email,created_at")
  .eq("provider", "kakao");
if (error) {
  console.error(error);
  process.exit(1);
}

const userIds = rows.map((r) => r.user_id);
const { data: profs } = await sb
  .from("profiles")
  .select("id,provider,auth_provider,provider_user_id,nickname,dibay_id,email")
  .in("id", userIds);

const plan = [];
for (const r of rows) {
  const p = (profs || []).find((x) => x.id === r.user_id);
  const currentPuid = p?.provider_user_id ?? null;
  const canonicalPuid = r.provider_user_id;
  const needs =
    !p ||
    p.provider !== "kakao" ||
    p.auth_provider !== "kakao" ||
    String(currentPuid) !== String(canonicalPuid);
  const collision = currentPuid && String(currentPuid) === String(r.user_id);
  plan.push({
    user_id_hash: hash(r.user_id),
    current_provider: p?.provider ?? null,
    current_auth_provider: p?.auth_provider ?? null,
    current_provider_user_id_kind: !currentPuid
      ? "NULL"
      : String(currentPuid) === String(r.user_id)
        ? "AUTH_UUID"
        : String(currentPuid) === String(canonicalPuid)
          ? "KAKAO_ID"
          : "OTHER",
    canonical_provider: "kakao",
    canonical_provider_user_id_hash: hash(canonicalPuid),
    proposed: needs
      ? { provider: "kakao", auth_provider: "kakao", provider_user_id: "(kakao service id)" }
      : "NOOP",
    needs_repair: needs,
    auth_uuid_collision_pattern: Boolean(collision),
    user_id_unchanged: true,
    dibay_id: p?.dibay_id ?? null,
    nickname: p?.nickname ?? null,
  });
}

const needs = plan.filter((x) => x.needs_repair);
console.log(
  JSON.stringify(
    {
      total_kakao_identities: rows.length,
      needs_repair: needs.length,
      already_aligned: plan.length - needs.length,
      duplicate_canonical_check: "run UNIQUE(provider,provider_user_id) — expect 0 dups",
      plan,
    },
    null,
    2,
  ),
);
