// B+ UI staging seed (CI only). Creates a NEW test admin in the disposable local Supabase:
// auth user (random password, masked in logs) + profile + active admin_memberships row,
// plus the import principal and the post-images bucket. Refuses to touch a non-local DB.
// Writes BPLUS_UI_EMAIL / BPLUS_UI_PASSWORD to $GITHUB_ENV for the Playwright step.
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.STAGING_SUPABASE_URL || "";
const key = process.env.STAGING_SERVICE_ROLE_KEY || "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error(`refusing non-local DB: ${url}`);
const sb = createClient(url, key, { auth: { persistSession: false } });

const email = "bplus-ui-admin@staging.local";
const password = `Ui-${randomUUID()}`;
console.log(`::add-mask::${password}`);

const must = (label, r) => {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return r.data;
};

const admin = must("create admin", await sb.auth.admin.createUser({ email, password, email_confirm: true }));
const uid = admin.user.id;
const now = new Date().toISOString();
must(
  "profile",
  await sb.from("profiles").upsert({
    id: uid,
    email,
    nickname: "B+ UI 테스트 관리자",
    role: "super_admin",
    status: "active",
    member_status: "active",
    dibay_id: "bplusui",
    username: "bplusui",
    username_confirmed: true,
    terms_accepted_at: now,
    terms_version: "2026-04-store-review",
    privacy_accepted_at: now,
    privacy_version: "2026-04-store-review",
    onboarding_status: "completed",
    onboarding_completed_at: now,
    profile_completed: true,
  }),
);
must("membership", await sb.from("admin_memberships").insert({ user_id: uid, role: "super_admin", status: "active", bootstrap_seed: true }));

const principal = must("principal user", await sb.auth.admin.createUser({ email: "import-principal@staging.local", password: `P-${randomUUID()}`, email_confirm: true }));
must("principal", await sb.from("community_import_principal").insert({ user_id: principal.user.id }));
const { data: buckets } = await sb.storage.listBuckets();
if (!buckets?.some((b) => b.id === "post-images")) must("bucket", await sb.storage.createBucket("post-images", { public: true }));

if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `BPLUS_UI_EMAIL=${email}\nBPLUS_UI_PASSWORD=${password}\nBPLUS_UI_ADMIN_ID=${uid}\n`);
console.log(`seeded test admin ${uid} (super_admin, active) + principal + bucket`);
