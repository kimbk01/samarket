/**
 * Slice1 Trust Runtime — read-only identity + baseline (no mutation).
 * Usage: node --env-file=.env.local scripts/qa/slice1-trust-runtime-baseline.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const ASAS55_ID = "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const outPath = process.argv[2];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(JSON.stringify({ ok: false, error: "missing supabase env" }));
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: byId, error: e1 } = await sb
    .from("profiles")
    .select("id, nickname, display_name, username, dibay_id, trust_score, manner_score")
    .eq("id", ASAS55_ID)
    .maybeSingle();

  const { data: byLogin, error: e2 } = await sb
    .from("profiles")
    .select("id, nickname, display_name, username, dibay_id, trust_score, manner_score")
    .or("nickname.eq.asas55,dibay_id.eq.asas55,username.eq.asas55")
    .limit(5);

  const { data: comps } = await sb
    .from("profiles")
    .select("id, nickname, display_name, dibay_id, trust_score")
    .or(
      "nickname.eq.aaaa,dibay_id.eq.aaaa,nickname.eq.qqqq,dibay_id.eq.qqqq,nickname.eq.aa11,dibay_id.eq.aa11",
    )
    .limit(5);

  const targetId = byId?.id || byLogin?.[0]?.id || null;
  const { data: logs } = targetId
    ? await sb
        .from("reputation_logs")
        .select("id, user_id, source_type, delta, reason, status, metadata, created_at")
        .eq("user_id", targetId)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  const host = String(url).replace(/^https?:\/\//, "").split("/")[0];
  const payload = {
    ok: true,
    readOnly: true,
    supabaseHost: host,
    asas55HintId: ASAS55_ID,
    byId: byId
      ? {
          id: byId.id,
          nickname: byId.nickname,
          display_name: byId.display_name,
          username: byId.username ?? null,
          dibay_id: byId.dibay_id ?? null,
          trust_score: byId.trust_score,
          manner_score: byId.manner_score ?? null,
        }
      : null,
    e1: e1?.message ?? null,
    byLogin: (byLogin || []).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      display_name: p.display_name,
      dibay_id: p.dibay_id ?? null,
      trust_score: p.trust_score,
    })),
    e2: e2?.message ?? null,
    comparisonCandidates: (comps || []).map((p) => ({
      id: p.id,
      nickname: p.nickname,
      display_name: p.display_name,
      dibay_id: p.dibay_id ?? null,
      trust_score: p.trust_score,
    })),
    latestReputationLogs: (logs || []).map((l) => ({
      id: l.id,
      user_id: l.user_id,
      source_type: l.source_type,
      delta: l.delta,
      reason: l.reason,
      status: l.status,
      created_at: l.created_at,
      metadata_admin_user_id:
        l.metadata && typeof l.metadata === "object" && "admin_user_id" in l.metadata
          ? l.metadata.admin_user_id
          : null,
    })),
  };

  const text = JSON.stringify(payload, null, 2);
  console.log(text);
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, text);
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  process.exit(1);
});
