/**
 * Fix privacy published status after realign demote bug.
 * Usage: npx tsx --env-file=.env.local scripts/fix-privacy-consent-published.ts
 */
import { createClient } from "@supabase/supabase-js";
import { STORE_PRIVACY_VERSION } from "../lib/auth/store-member-policy";
import { DIBAY_PRIVACY_POLICY_CONTENT } from "../lib/legal/dibay-privacy-policy-content";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing env");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date().toISOString();

  for (const locale of ["ko", "en"] as const) {
    const { data: rows, error } = await sb
      .from("app_legal_documents")
      .select("id, version, status")
      .eq("kind", "privacy")
      .eq("locale", locale);
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    const binding = (rows ?? []).find((r) => r.version === STORE_PRIVACY_VERSION);
    if (!binding) {
      console.error("missing binding", locale);
      process.exit(1);
    }
    const { error: upErr } = await sb
      .from("app_legal_documents")
      .update({
        title: DIBAY_PRIVACY_POLICY_CONTENT[locale].title,
        body: DIBAY_PRIVACY_POLICY_CONTENT[locale].body,
        status: "published",
        effective_at: "2026-04-01T00:00:00.000Z",
        published_at: now,
        updated_at: now,
      })
      .eq("id", binding.id);
    if (upErr) {
      console.error(upErr.message);
      process.exit(1);
    }
    console.log("published", locale, binding.id, STORE_PRIVACY_VERSION);

    for (const row of rows ?? []) {
      if (row.id === binding.id) continue;
      if (row.status !== "published") continue;
      await sb.from("app_legal_documents").update({ status: "draft", updated_at: now }).eq("id", row.id);
      console.log("demoted other", locale, row.id, row.version);
    }
  }
  console.log("OK");
}

void main();
