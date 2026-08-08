/**
 * One-shot: publish DIBAY privacy policy body into app_legal_documents (ko+en).
 * Uses existing CMS SSOT — does not create a new writer system.
 *
 * Usage: npx tsx --env-file=.env.local scripts/publish-dibay-privacy-policy-cms.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  DIBAY_PRIVACY_POLICY_CONTENT,
  DIBAY_PRIVACY_POLICY_EFFECTIVE_ISO,
  DIBAY_PRIVACY_POLICY_VERSION,
} from "../lib/legal/dibay-privacy-policy-content";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date().toISOString();

  for (const locale of ["ko", "en"] as const) {
    const { title, body } = DIBAY_PRIVACY_POLICY_CONTENT[locale];
    const { data: existing, error: listErr } = await sb
      .from("app_legal_documents")
      .select("id, version, status")
      .eq("kind", "privacy")
      .eq("locale", locale)
      .eq("status", "published")
      .order("effective_at", { ascending: false, nullsFirst: false })
      .limit(5);

    if (listErr) {
      console.error(locale, "list", listErr.message);
      process.exit(1);
    }

    const current = existing?.[0];
    if (current?.id) {
      const { error } = await sb
        .from("app_legal_documents")
        .update({
          title,
          body,
          version: DIBAY_PRIVACY_POLICY_VERSION,
          status: "published",
          effective_at: DIBAY_PRIVACY_POLICY_EFFECTIVE_ISO,
          published_at: now,
          updated_at: now,
        })
        .eq("id", current.id);
      if (error) {
        console.error(locale, "update", error.message);
        process.exit(1);
      }
      console.log("updated", locale, current.id, "body_len", body.length);
    } else {
      const { data, error } = await sb
        .from("app_legal_documents")
        .insert({
          kind: "privacy",
          locale,
          title,
          body,
          version: DIBAY_PRIVACY_POLICY_VERSION,
          status: "published",
          effective_at: DIBAY_PRIVACY_POLICY_EFFECTIVE_ISO,
          published_at: now,
        })
        .select("id")
        .maybeSingle();
      if (error) {
        console.error(locale, "insert", error.message);
        process.exit(1);
      }
      console.log("inserted", locale, data?.id, "body_len", body.length);
    }
  }

  console.log("OK", DIBAY_PRIVACY_POLICY_VERSION);
}

void main();
