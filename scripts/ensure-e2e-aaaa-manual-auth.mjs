/**
 * 로컬 E2E: `aaaa` → `aaaa@manual.local` (resolve-password-login-identifier) 와 Supabase Auth 정합.
 * - auth.users: 이메일 aaaa@manual.local, 비밀번호 1234 (없으면 생성, 있으면 비밀번호·email_confirm 갱신)
 * - profiles: 동일 id에 username `aaaa` (non-privileged role/is_admin — Admin SSOT is membership)
 * - admin_memberships: active super_admin for the same UUID
 * - test_users: legacy QA display row (not Admin authority)
 *
 * 필요: .env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * 실행: node scripts/ensure-e2e-aaaa-manual-auth.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const EMAIL = "aaaa@manual.local";
const PASSWORD = "1234";
const LOGIN_ID = "aaaa";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) throw new Error("Missing .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  const raw = readFileSync(p, "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
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
    if (page > 50) throw new Error("listUsers: too many pages while searching for email");
  }
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(".env.local: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(".env.local: NEXT_PUBLIC_SUPABASE_ANON_KEY required (sign-in probe for short passwords)");
  }
  const sbAnon = createClient(url, anonKey, { auth: { persistSession: false } });

  let user = await findUserByEmail(sb, EMAIL);
  let created = false;
  let passwordUpdated = false;
  let passwordSkippedAlreadyValid = false;

  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: {
        username: LOGIN_ID,
        login_id: LOGIN_ID,
        nickname: "메인관리자",
        auth_provider: "e2e_manual_local",
        provider: "email",
      },
    });
    if (error || !data.user) {
      const hint =
        /at least \d+ characters/i.test(String(error?.message ?? "")) ?
          " Supabase Auth 최소 비밀번호 길이를 4 이하로 내리거나(대시보드 Authentication → Providers → Email), SQL로 bcrypt 설정 후 이 스크립트는 signIn 검증만 건너뜁니다."
        : "";
      throw new Error(`createUser: ${error?.message || "no user"}.${hint}`);
    }
    user = data.user;
    created = true;
  } else {
    const probe = await sbAnon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    await sbAnon.auth.signOut().catch(() => {});
    if (!probe.error) {
      passwordSkippedAlreadyValid = true;
    } else {
      const { data, error } = await sb.auth.admin.updateUserById(user.id, {
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) {
        const msg = String(error?.message ?? "no user");
        const hint =
          /at least \d+ characters/i.test(msg) ?
            " Dashboard에서 Auth 최소 비밀번호 길이를 4로 낮춘 뒤 재실행하거나, Supabase SQL Editor에서 auth.users.encrypted_password 를 crypt('1234', gen_salt('bf')) 로 설정한 뒤 재실행하세요(이 스크립트는 그때 signIn 성공으로 갱신을 건너뜁니다)."
          : "";
        throw new Error(`updateUserById: ${msg}.${hint}`);
      }
      user = data.user;
      passwordUpdated = true;
    }
  }

  const uid = user.id;

  const { data: conflictProfiles } = await sb
    .from("profiles")
    .select("id, username, email")
    .ilike("username", LOGIN_ID)
    .neq("id", uid);

  const renamed = [];
  for (const row of conflictProfiles ?? []) {
    const rid = row.id;
    const suffix = String(rid).replace(/-/g, "").slice(0, 8);
    const newName = `${LOGIN_ID}_samarket_${suffix}`;
    const { error: upErr } = await sb.from("profiles").update({ username: newName, updated_at: new Date().toISOString() }).eq("id", rid);
    if (upErr) throw new Error(`profiles conflict rename ${rid}: ${upErr.message}`);
    renamed.push({ fromId: rid, newUsername: newName, previousEmail: row.email });
  }

  const { data: conflictTest } = await sb.from("test_users").select("id, username").ilike("username", LOGIN_ID).neq("id", uid);
  for (const row of conflictTest ?? []) {
    const suffix = String(row.id).replace(/-/g, "").slice(0, 8);
    const newName = `${LOGIN_ID}_tu_${suffix}`;
    const { error: tuErr } = await sb.from("test_users").update({ username: newName }).eq("id", row.id);
    if (tuErr) throw new Error(`test_users conflict rename: ${tuErr.message}`);
    renamed.push({ testUserId: row.id, newUsername: newName });
  }

  const nowIso = new Date().toISOString();
  // Profile = Person row only (non-privileged). Admin authority = admin_memberships.
  const profilePayload = {
    id: uid,
    email: EMAIL,
    auth_login_email: EMAIL,
    username: LOGIN_ID,
    nickname: "메인관리자",
    display_name: "메인관리자",
    role: "user",
    member_type: "normal",
    auth_provider: "admin_manual",
    provider: "admin_manual",
    is_admin: false,
    phone_verified: true,
    phone_verification_status: "verified",
    status: "verified_user",
    member_status: "verified_member",
    updated_at: nowIso,
  };

  const { error: profErr } = await sb.from("profiles").upsert(profilePayload, { onConflict: "id" });
  if (profErr) throw new Error(`profiles upsert: ${profErr.message}`);

  let membershipNote = "admin_memberships skipped";
  const { data: activeMembership } = await sb
    .from("admin_memberships")
    .select("id")
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();
  if (activeMembership?.id) {
    const { error: memUpErr } = await sb
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
    membershipNote = memUpErr
      ? `admin_memberships update failed: ${memUpErr.message}`
      : "admin_memberships updated super_admin";
  } else {
    const { error: memInsErr } = await sb.from("admin_memberships").insert({
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
    membershipNote = memInsErr
      ? `admin_memberships insert failed: ${memInsErr.message}`
      : "admin_memberships inserted super_admin";
  }

  const { error: tuUpsertErr } = await sb.from("test_users").upsert(
    {
      id: uid,
      username: LOGIN_ID,
      password: PASSWORD,
      role: "master",
      display_name: "메인관리자",
    },
    { onConflict: "id" }
  );
  const testUsersNote = tuUpsertErr ? `test_users skipped: ${tuUpsertErr.message}` : "test_users upserted (legacy QA debt)";

  const { data: profCheck } = await sb.from("profiles").select("id, email, username, auth_login_email").eq("id", uid).maybeSingle();
  const { data: authCheck } = await sb.auth.admin.getUserById(uid);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        ok: true,
        authUserId: uid,
        email: authCheck?.user?.email,
        authCreated: created,
        authPasswordSet: created || passwordUpdated,
        authPasswordSkippedValid: passwordSkippedAlreadyValid,
        profilesRow: profCheck,
        usernameConflictsRenamed: renamed,
        membership: membershipNote,
        testUsers: testUsersNote,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
