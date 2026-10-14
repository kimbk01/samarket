/**
 * TEST-only Deploy Owner provisioning (Area A).
 * Reuses Production admin authority contract:
 *   Auth user + profiles (non-privileged person row) + admin_memberships(super_admin)
 * Hard-refuses any project other than tcwnueuzuxftyomttdyu.
 *
 * Env:
 *   .secrets/test-supabase-api.env  (URL + anon + service_role)
 * Optional:
 *   TEST_DEPLOY_OWNER_EMAIL / PASSWORD / LOGIN_ID
 *
 * Writes credentials to .secrets/test-deploy-owner.json (local only, gitignored via .secrets/).
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

const TEST_REF = "tcwnueuzuxftyomttdyu";
const PROD_REF = "ckdosyydvgzqwpbwuhon";

function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function projectRefFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const m = /^([a-z0-9]{20})\.supabase\.(co|in)$/.exec(host);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

async function findUserByEmail(sb, email) {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const u = data.users.find((x) => (x.email || "").toLowerCase() === target);
    if (u) return u;
    if ((data.users?.length ?? 0) < perPage) return null;
    page += 1;
    if (page > 50) throw new Error("listUsers pagination exceeded");
  }
}

async function main() {
  const api = loadEnvFile(resolve(process.cwd(), ".secrets/test-supabase-api.env"));
  const url = api.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = api.SUPABASE_SERVICE_ROLE_KEY || "";
  const anonKey = api.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const ref = projectRefFromUrl(url);

  if (!url || !serviceKey || !anonKey) {
    throw new Error("Missing .secrets/test-supabase-api.env (URL/anon/service_role)");
  }
  if (ref === PROD_REF) throw new Error("ABORT: production project ref");
  if (ref !== TEST_REF) {
    throw new Error(`ABORT: expected TEST ref ${TEST_REF}, got ${ref}`);
  }

  const EMAIL = (
    process.env.TEST_DEPLOY_OWNER_EMAIL || "dibay.test.deploy.owner@gmail.com"
  )
    .trim()
    .toLowerCase();
  const LOGIN_ID = (process.env.TEST_DEPLOY_OWNER_LOGIN_ID || "testowner").trim();
  let PASSWORD = process.env.TEST_DEPLOY_OWNER_PASSWORD || "";
  if (!PASSWORD) {
    PASSWORD = `TOwn-${randomBytes(12).toString("base64url")}`;
  }
  if (PASSWORD.length < 8) {
    throw new Error("TEST_DEPLOY_OWNER_PASSWORD must be >= 8 chars");
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
  const sbAnon = createClient(url, anonKey, { auth: { persistSession: false } });

  let user = await findUserByEmail(sb, EMAIL);
  let created = false;
  let passwordUpdated = false;

  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: LOGIN_ID,
        login_id: LOGIN_ID,
        nickname: "TEST Deploy Owner",
        auth_provider: "test_deploy_owner",
        provider: "email",
      },
    });
    if (error || !data.user) {
      throw new Error(`createUser: ${error?.message || "no user"}`);
    }
    user = data.user;
    created = true;
  } else {
    const probe = await sbAnon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    await sbAnon.auth.signOut().catch(() => {});
    if (probe.error) {
      const { data, error } = await sb.auth.admin.updateUserById(user.id, {
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`updateUserById: ${error?.message || "no user"}`);
      }
      user = data.user;
      passwordUpdated = true;
    }
  }

  const uid = user.id;
  const nowIso = new Date().toISOString();

  // Person row only — privilege is admin_memberships (same as ensure-e2e-aaaa-manual-auth).
  const profilePayload = {
    id: uid,
    email: EMAIL,
    auth_login_email: EMAIL,
    username: LOGIN_ID,
    nickname: "TEST Deploy Owner",
    display_name: "TEST Deploy Owner",
    role: "user",
    member_type: "normal",
    auth_provider: "admin_manual",
    provider: "admin_manual",
    is_admin: false,
    phone_verified: true,
    phone_verification_status: "verified",
    status: "verified_user",
    member_status: "verified_member",
    terms_accepted_at: nowIso,
    terms_version: "2026-04-store-review",
    privacy_accepted_at: nowIso,
    privacy_version: "2026-04-store-review",
    onboarding_status: "completed",
    onboarding_completed_at: nowIso,
    profile_completed: true,
    updated_at: nowIso,
  };

  const { error: profErr } = await sb.from("profiles").upsert(profilePayload, {
    onConflict: "id",
  });
  if (profErr) throw new Error(`profiles upsert: ${profErr.message}`);

  const { data: activeMembership } = await sb
    .from("admin_memberships")
    .select("id")
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();

  let membershipNote = "";
  if (activeMembership?.id) {
    const { error } = await sb
      .from("admin_memberships")
      .update({
        role: "super_admin",
        admin_tier: null,
        bootstrap_seed: true,
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
        updated_at: nowIso,
      })
      .eq("id", activeMembership.id);
    if (error) throw new Error(`membership update: ${error.message}`);
    membershipNote = "updated_super_admin";
  } else {
    const { error } = await sb.from("admin_memberships").insert({
      user_id: uid,
      role: "super_admin",
      status: "active",
      admin_tier: null,
      granted_at: nowIso,
      granted_by: null,
      bootstrap_seed: true,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (error) throw new Error(`membership insert: ${error.message}`);
    membershipNote = "inserted_super_admin";
  }

  // Login probe
  const login = await sbAnon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (login.error || !login.data.session) {
    throw new Error(`signIn probe failed: ${login.error?.message || "no session"}`);
  }
  await sbAnon.auth.signOut().catch(() => {});

  const { data: memCheck } = await sb
    .from("admin_memberships")
    .select("user_id, role, status, admin_tier, bootstrap_seed")
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();

  mkdirSync(resolve(process.cwd(), ".secrets"), { recursive: true });
  const outPath = resolve(process.cwd(), ".secrets/test-deploy-owner.json");
  const payload = {
    createdAt: nowIso,
    projectRef: TEST_REF,
    email: EMAIL,
    loginId: LOGIN_ID,
    password: PASSWORD,
    userId: uid,
    authCreated: created,
    passwordUpdated,
    membership: membershipNote,
    membershipRow: memCheck,
    note:
      "TEST-only Deploy Owner. Set Vercel test env DIBAY_DEPLOY_OWNER_IDS and include userId in DIBAY_TEST_ALLOWED_USER_IDS. Never use on Production.",
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  chmodSync(outPath, 0o600);

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectRef: TEST_REF,
        userId: uid,
        email: EMAIL,
        loginId: LOGIN_ID,
        authCreated: created,
        passwordUpdated,
        membership: membershipNote,
        signInProbe: "pass",
        secretsPath: ".secrets/test-deploy-owner.json",
        nextOwnerActions: [
          "vercel env: DIBAY_DEPLOY_OWNER_IDS=<userId> on Custom Environment test",
          "vercel env: ensure DIBAY_TEST_ALLOWED_USER_IDS includes <userId>",
          "Do NOT set DIBAY_PROMOTE_ENABLED or DIBAY_PROMOTE_EXECUTION_UNLOCKED",
        ],
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
