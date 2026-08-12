#!/usr/bin/env npx tsx
/**
 * Address formatter runtime against live QA member `user_addresses` rows.
 * Proves formatAddressBookLine / formatPublicAddress / formatDeliveryAddress on real data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  formatAddressBookLine,
  formatAddressBookLineSegments,
  formatDeliveryAddress,
  formatPublicAddress,
} from "@/lib/addresses/user-address-format";
import { listUserAddresses } from "@/lib/addresses/user-address-service";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(
  ROOT,
  `.qa-logs/address-formatter-live-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
fs.mkdirSync(OUT, { recursive: true });

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("missing supabase env");
  const login = process.env.GATE4_RECEIVER_LOGIN || process.env.QA_MEMBER_LOGIN || "qqqq";
  const passwords = [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_MEMBER_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean),
    ),
  ];
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null as Awaited<ReturnType<typeof sb.auth.signInWithPassword>>["data"]["session"];
  for (const email of [`${login}@manual.local`, `${login}@dibay.local`, `${login}@samarket.local`]) {
    for (const password of passwords) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        session = data.session;
        break;
      }
    }
    if (session) break;
  }
  if (!session) throw new Error(`login fail: ${login}`);

  const rows = await listUserAddresses(sb, session.user.id);
  const samples = rows.slice(0, 8).map((r) => {
    const book = formatAddressBookLine(r);
    const seg = formatAddressBookLineSegments(r);
    const pub = formatPublicAddress(r);
    const del = formatDeliveryAddress(r);
    return {
      id: r.id,
      label: r.labelType,
      book,
      detailBold: seg?.detail ?? null,
      rest: seg?.rest ?? null,
      public: pub,
      deliveryLines: del.split("\n").length,
      deliveryHasUnit: /^\s*Unit|/i.test(del) || Boolean(r.unitFloorRoom || r.detailAddress),
      countryInBook: /PHILIPPINES|Philippines|필리핀/i.test(book || ""),
      publicLeak: /Unit|Barangay|Street|PHILIPPINES/i.test(pub || ""),
    };
  });

  const countryFail = samples.some((s) => s.countryInBook);
  const publicFail = samples.some((s) => s.publicLeak);
  const emptyBook = samples.some((s) => !s.book);
  const status = !countryFail && !publicFail && !emptyBook && samples.length > 0 ? "PASS" : "FAIL";
  const report = {
    login,
    userId: session.user.id,
    count: rows.length,
    status,
    countryExcluded: !countryFail,
    publicCityOnly: !publicFail,
    samples,
  };
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`OUT=${OUT}`);
  process.exit(status === "PASS" ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
