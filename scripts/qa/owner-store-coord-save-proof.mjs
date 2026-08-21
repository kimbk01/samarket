/**
 * Owner store location write proof (no batch geocode).
 * Uses existing QA auth path: password probe OR service-role magiclink.
 *
 * Usage:
 *   node --env-file=.env.local scripts/qa/owner-store-coord-save-proof.mjs
 *
 * Optional:
 *   OWNER_STORE_SLUG=asas22
 *   E2E_TEST_PASSWORD / QA_MANUAL_PASSWORD
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  for (const rel of [".env.local", ".env.vercel.production"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_MEMBER_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

function validCoord(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

async function loginAsUser(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("missing supabase anon env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });

  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data.session) return { session: data.session, method: "password" };
  }

  if (!sk) throw new Error("password login failed and no SERVICE_ROLE for magiclink");
  const adminSb = createClient(url, sk, { auth: { persistSession: false } });
  const { data: link, error: linkErr } = await adminSb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) {
    throw new Error(`magiclink failed: ${linkErr?.message || "no token"}`);
  }
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (otpErr || !verified.session) {
    throw new Error(`otp failed: ${otpErr?.message || "no session"}`);
  }
  return { session: verified.session, method: "magiclink" };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const base = (process.env.SAMARKET_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000").replace(
    /\/$/,
    ""
  );
  if (!url || !sk) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");

  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const preferredSlug = (process.env.OWNER_STORE_SLUG || "").trim();

  const { data: stores, error: sErr } = await admin
    .from("stores")
    .select("id, store_name, slug, owner_user_id, lat, lng, formatted_address, address_line1, place_id")
    .order("created_at", { ascending: true })
    .limit(50);
  if (sErr) throw sErr;

  const textOnly = (stores || []).filter((s) => {
    const ok = validCoord(s.lat, s.lng);
    const hasText = !!(String(s.formatted_address || "").trim() || String(s.address_line1 || "").trim());
    return !ok && hasText;
  });

  let target =
    (preferredSlug && textOnly.find((s) => s.slug === preferredSlug)) ||
    textOnly.find((s) => String(s.slug || "").startsWith("asas")) ||
    textOnly[0];

  if (!target) {
    console.log(JSON.stringify({ ok: false, error: "no_text_only_store" }, null, 2));
    process.exit(2);
  }

  const { data: authUser, error: uErr } = await admin.auth.admin.getUserById(String(target.owner_user_id));
  if (uErr || !authUser?.user?.email) {
    throw new Error(`owner email missing: ${uErr?.message || target.owner_user_id}`);
  }
  const email = authUser.user.email;

  const before = {
    id: target.id,
    slug: target.slug,
    name: target.store_name,
    lat: target.lat,
    lng: target.lng,
    address_line1: target.address_line1,
    formatted_address: target.formatted_address,
    place_id: target.place_id,
  };

  const { session, method } = await loginAsUser(email);
  const ref = new URL(url).hostname.split(".")[0];
  const cookieParts = [
    `sb-${ref}-auth-token=${encodeURIComponent(
      JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: "bearer",
        user: session.user,
      })
    )}`,
  ];
  const { data: pr } = await admin
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  if (pr?.active_session_id) {
    cookieParts.push(`samarket_active_session_id=${encodeURIComponent(String(pr.active_session_id))}`);
  }

  // Canonical Quezon City pin — Owner address-select equivalent payload (not batch geocode of existing text).
  const patchBody = {
    region: "Metro Manila",
    city: "Quezon City",
    address_line1: "Commonwealth Avenue",
    address_line2: "Owner coord proof",
    formatted_address: "Commonwealth Avenue, Quezon City, Metro Manila, Philippines",
    place_id: "ChIJOwnerCoordProofDibay001",
    lat: 14.676_041,
    lng: 121.043_701,
  };

  const patchRes = await fetch(`${base}/api/me/stores/${encodeURIComponent(target.id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieParts.join("; "),
    },
    body: JSON.stringify(patchBody),
  });
  const patchJson = await patchRes.json().catch(() => ({}));

  const { data: afterRow, error: afterErr } = await admin
    .from("stores")
    .select("id, slug, lat, lng, formatted_address, address_line1, place_id")
    .eq("id", target.id)
    .maybeSingle();
  if (afterErr) throw afterErr;

  const afterOk = validCoord(afterRow?.lat, afterRow?.lng);
  const report = {
    ok: patchRes.ok && patchJson?.ok === true && afterOk,
    base,
    login: { email, method },
    before,
    patchHttp: patchRes.status,
    patchJson: {
      ok: patchJson?.ok,
      error: patchJson?.error,
      storeLat: patchJson?.store?.lat,
      storeLng: patchJson?.store?.lng,
    },
    after: afterRow,
    adminWouldShowReady: afterOk,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
});
