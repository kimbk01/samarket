/**
 * Realign privacy CMS version to consent-binding STORE_* version while keeping full body.
 * Avoids mass re-consent after CMS↔consent wire.
 *
 * Usage: npx tsx --env-file=.env.local scripts/realign-privacy-consent-version.ts
 */
import { createClient } from "@supabase/supabase-js";
import { STORE_PRIVACY_VERSION } from "../lib/auth/store-member-policy";
import { DIBAY_PRIVACY_POLICY_CONTENT } from "../lib/legal/dibay-privacy-policy-content";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  const targetVersion = STORE_PRIVACY_VERSION;

  for (const locale of ["ko", "en"] as const) {
    const body = DIBAY_PRIVACY_POLICY_CONTENT[locale].body;
    const title = DIBAY_PRIVACY_POLICY_CONTENT[locale].title;

    const { data: rows, error: listErr } = await sb
      .from("app_legal_documents")
      .select("id, version, status, body")
      .eq("kind", "privacy")
      .eq("locale", locale)
      .order("updated_at", { ascending: false });
    if (listErr) {
      console.error(locale, listErr.message);
      process.exit(1);
    }

    const published = (rows ?? []).filter((r) => r.status === "published");
    const target = published.find((r) => r.version === targetVersion) ?? null;
    const drift = published.find((r) => r.version !== targetVersion) ?? null;

    if (target) {
      const { error } = await sb
        .from("app_legal_documents")
        .update({
          title,
          body,
          status: "published",
          published_at: now,
          updated_at: now,
        })
        .eq("id", target.id);
      if (error) {
        console.error(locale, "update target", error.message);
        process.exit(1);
      }
      console.log("updated binding row", locale, target.id, targetVersion, "body_len", body.length);
    } else if (drift) {
      // No row with STORE version — rename drift version if unique allows
      const { error } = await sb
        .from("app_legal_documents")
        .update({
          title,
          body,
          version: targetVersion,
          status: "published",
          published_at: now,
          updated_at: now,
        })
        .eq("id", drift.id);
      if (error) {
        console.error(locale, "rename drift", error.message);
        process.exit(1);
      }
      console.log("renamed", locale, drift.id, drift.version, "→", targetVersion);
    } else {
      const { data, error } = await sb
        .from("app_legal_documents")
        .insert({
          kind: "privacy",
          locale,
          title,
          body,
          version: targetVersion,
          status: "published",
          effective_at: "2026-04-01T00:00:00.000Z",
          published_at: now,
        })
        .select("id")
        .maybeSingle();
      if (error) {
        console.error(locale, "insert", error.message);
        process.exit(1);
      }
      console.log("inserted", locale, data?.id, targetVersion);
    }

    // Demote other published privacy versions for this locale (re-query after mutate)
    const { data: afterRows, error: afterErr } = await sb
      .from("app_legal_documents")
      .select("id, version, status")
      .eq("kind", "privacy")
      .eq("locale", locale)
      .eq("status", "published");
    if (afterErr) {
      console.error(locale, "relist", afterErr.message);
      process.exit(1);
    }
    for (const row of afterRows ?? []) {
      if (row.version === targetVersion) continue;
      const { error } = await sb
        .from("app_legal_documents")
        .update({ status: "draft", updated_at: now })
        .eq("id", row.id);
      if (error) {
        console.error(locale, "demote", row.id, error.message);
        process.exit(1);
      }
      console.log("demoted to draft", locale, row.id, row.version);
    }
  }

  console.log("OK privacy consent realign →", targetVersion);
}

void main();
