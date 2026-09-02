#!/usr/bin/env node
/**
 * CUT 3B — STORE_SETTLEMENT / reference fail-closed targeted R1–R6.
 * Usage: node --env-file=.env.local scripts/qa/support-cut3b-reference-authority-runtime.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIXTURE,
  apiJson,
  loginSession,
  memberContext,
  ownerContext,
  sbService,
  loadEnvLocal,
} from "./support-cut3-lib.mjs";

const OUT = resolve(process.cwd(), "docs/support-center/support-cut3-runtime-close-report.json");

function loadReport() {
  if (!existsSync(OUT)) return { checklist: {} };
  return JSON.parse(readFileSync(OUT, "utf8"));
}

function save(report) {
  mkdirSync(resolve(process.cwd(), "docs/support-center"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

async function main() {
  loadEnvLocal();
  const report = loadReport();
  report.cut3b = report.cut3b || {};
  report.cut3b.reference_inventory = [
    { TYPE: "GIFT_INSTANCE", VALIDATOR: "gift_certificate_instances.current_owner_user_id", AUTHORITY_KEY: "requester", FAIL_CLOSED: "ACTIVE" },
    { TYPE: "STORE_ORDER", VALIDATOR: "store_orders.buyer_user_id", AUTHORITY_KEY: "requester", FAIL_CLOSED: "ACTIVE" },
    { TYPE: "STORE_PRODUCT", VALIDATOR: "store_products.store_id + owner gate", AUTHORITY_KEY: "owner_store", FAIL_CLOSED: "ACTIVE" },
    { TYPE: "AD_CAMPAIGN", VALIDATOR: "store_*_ad_campaigns.store_id + owner gate", AUTHORITY_KEY: "owner_store", FAIL_CLOSED: "ACTIVE" },
    { TYPE: "DELIVERY_AD_CAMPAIGN", VALIDATOR: "alias AD_CAMPAIGN", AUTHORITY_KEY: "owner_store", FAIL_CLOSED: "ACTIVE" },
    { TYPE: "STORE_SETTLEMENT", VALIDATOR: "store_settlements.store_id + OWNER + owner gate", AUTHORITY_KEY: "owner_store", FAIL_CLOSED: "ACTIVE" },
    { TYPE: "*", VALIDATOR: "none", AUTHORITY_KEY: "deny", FAIL_CLOSED: "DENY" },
  ];

  const sb = sbService();
  const sessionOwner = await loginSession(FIXTURE.owner);
  const sessionMember = await loginSession(FIXTURE.memberA);
  const ownerId = sessionOwner.user.id;

  const { data: owned } = await sb
    .from("stores")
    .select("id")
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: true });
  const s1 = owned?.[0]?.id ? String(owned[0].id) : null;
  const s2 = owned?.[1]?.id ? String(owned[1].id) : null;
  const { data: foreign } = await sb
    .from("stores")
    .select("id")
    .neq("owner_user_id", ownerId)
    .limit(1)
    .maybeSingle();
  const sx = foreign?.id ? String(foreign.id) : null;

  if (!s1) {
    report.cut3b.reference = { status: "NOT_PROVEN", blocker: "owner_has_no_store" };
    save(report);
    console.log(JSON.stringify(report.cut3b, null, 2));
    process.exit(1);
  }

  const { data: s1Settlements } = await sb
    .from("store_settlements")
    .select("id, store_id")
    .eq("store_id", s1)
    .limit(1);
  let settlementS1 = s1Settlements?.[0]?.id ? String(s1Settlements[0].id) : null;

  let settlementS2 = null;
  if (s2) {
    const { data: rows } = await sb
      .from("store_settlements")
      .select("id, store_id")
      .eq("store_id", s2)
      .limit(1);
    settlementS2 = rows?.[0]?.id ? String(rows[0].id) : null;
  }
  if (!settlementS2 && sx) {
    const { data: rows } = await sb
      .from("store_settlements")
      .select("id, store_id")
      .eq("store_id", sx)
      .limit(1);
    settlementS2 = rows?.[0]?.id ? String(rows[0].id) : null;
  }

  const { data: sxSettlementRows } = sx
    ? await sb.from("store_settlements").select("id, store_id").eq("store_id", sx).limit(1)
    : { data: [] };
  const settlementSx = sxSettlementRows?.[0]?.id ? String(sxSettlementRows[0].id) : null;

  const results = {};

  // R1 authorized same-store
  if (!settlementS1) {
    results.R1_SAME_STORE = { status: "NOT_PROVEN", blocker: "no_settlement_for_s1" };
  } else {
    const r1 = await apiJson(sessionOwner, "POST", "/api/support/cases/open", {
      context: ownerContext(s1, {
        category: "SETTLEMENT",
        sourceSurface: "cut3b_r1_settlement",
        referenceType: "STORE_SETTLEMENT",
        referenceId: settlementS1,
      }),
    });
    results.R1_SAME_STORE =
      r1.status === 200 && r1.json?.ok
        ? { status: "PASS", caseId: r1.json.case?.id }
        : { status: "FAIL", http: r1.status, error: r1.json?.error };
  }

  // R2 different-store settlement while claiming S1
  if (!settlementS2) {
    results.R2_CROSS_STORE = { status: "NOT_PROVEN", blocker: "no_other_store_settlement" };
  } else {
    const r2 = await apiJson(sessionOwner, "POST", "/api/support/cases/open", {
      context: ownerContext(s1, {
        category: "SETTLEMENT",
        sourceSurface: "cut3b_r2_cross",
        referenceType: "STORE_SETTLEMENT",
        referenceId: settlementS2,
      }),
    });
    results.R2_CROSS_STORE =
      r2.status === 403 && r2.json?.error === "reference_forbidden"
        ? { status: "BLOCKED" }
        : { status: "FAIL", http: r2.status, error: r2.json?.error };
  }

  // R3 unauthorized store SX settlement with SX context (owner does not own SX)
  if (!settlementSx || !sx) {
    results.R3_UNAUTHORIZED_STORE = { status: "NOT_PROVEN", blocker: "no_sx_settlement" };
  } else {
    const r3 = await apiJson(sessionOwner, "POST", "/api/support/cases/open", {
      context: ownerContext(sx, {
        category: "SETTLEMENT",
        sourceSurface: "cut3b_r3_sx",
        referenceType: "STORE_SETTLEMENT",
        referenceId: settlementSx,
      }),
    });
    // store_forbidden (ownership) OR reference_forbidden — both DENY
    results.R3_UNAUTHORIZED_STORE =
      r3.status === 403 && (r3.json?.error === "store_forbidden" || r3.json?.error === "reference_forbidden")
        ? { status: "BLOCKED", error: r3.json?.error }
        : { status: "FAIL", http: r3.status, error: r3.json?.error };
  }

  // R4 MEMBER + settlement
  const settlementForMember = settlementS1 || settlementSx || "00000000-0000-4000-8000-000000000099";
  const r4 = await apiJson(sessionMember, "POST", "/api/support/cases/open", {
    context: memberContext({
      category: "OTHER",
      sourceSurface: "cut3b_r4_member_settlement",
      referenceType: "STORE_SETTLEMENT",
      referenceId: settlementForMember,
    }),
  });
  results.R4_MEMBER_SETTLEMENT =
    r4.status === 403 && r4.json?.error === "reference_forbidden"
      ? { status: "BLOCKED" }
      : { status: "FAIL", http: r4.status, error: r4.json?.error };

  // R5 unknown reference_type
  const r5 = await apiJson(sessionMember, "POST", "/api/support/cases/open", {
    context: memberContext({
      category: "OTHER",
      sourceSurface: "cut3b_r5_unknown",
      referenceType: "TOTALLY_UNKNOWN_TYPE",
      referenceId: "00000000-0000-4000-8000-000000000099",
    }),
  });
  results.R5_UNKNOWN_TYPE =
    r5.status === 403 &&
    (r5.json?.error === "reference_type_not_allowed" || r5.json?.error === "reference_forbidden")
      ? { status: "BLOCKED", error: r5.json?.error }
      : { status: "FAIL", http: r5.status, error: r5.json?.error };

  // R6 known-but-unimplemented former pass-through name (force DENY)
  const r6 = await apiJson(sessionOwner, "POST", "/api/support/cases/open", {
    context: ownerContext(s1, {
      category: "SETTLEMENT",
      sourceSurface: "cut3b_r6_unimplemented",
      referenceType: "PLATFORM_PAYOUT_LEGACY",
      referenceId: "00000000-0000-4000-8000-000000000099",
    }),
  });
  results.R6_UNIMPLEMENTED_KNOWN =
    r6.status === 403 &&
    (r6.json?.error === "reference_type_not_allowed" || r6.json?.error === "reference_forbidden")
      ? { status: "BLOCKED", error: r6.json?.error }
      : { status: "FAIL", http: r6.status, error: r6.json?.error };

  const critical = ["R1_SAME_STORE", "R2_CROSS_STORE", "R4_MEMBER_SETTLEMENT", "R5_UNKNOWN_TYPE", "R6_UNIMPLEMENTED_KNOWN"];
  const fail = critical.find((k) => results[k]?.status === "FAIL");
  const closed =
    !fail &&
    results.R1_SAME_STORE?.status === "PASS" &&
    results.R2_CROSS_STORE?.status === "BLOCKED" &&
    results.R4_MEMBER_SETTLEMENT?.status === "BLOCKED" &&
    results.R5_UNKNOWN_TYPE?.status === "BLOCKED" &&
    results.R6_UNIMPLEMENTED_KNOWN?.status === "BLOCKED";

  report.cut3b.reference_results = results;
  report.cut3b.REFERENCE_AUTHORITY = closed ? "CLOSED" : fail ? "NOT_CLOSED" : "NOT_CLOSED";
  report.checklist = report.checklist || {};
  report.checklist.REFERENCE_TAMPER_UNIMPLEMENTED_TYPE = {
    status: results.R6_UNIMPLEMENTED_KNOWN?.status === "BLOCKED" ? "BLOCKED" : "FAIL",
  };
  report.SUPPORT_AUTHORITY = "NOT_CLOSED"; // notification/realtime still open unless later updated
  if (closed) {
    report.CASE_IDENTITY_AUTHORITY = "CLOSED";
    report.REFERENCE_AUTHORITY = "CLOSED";
  } else {
    report.REFERENCE_AUTHORITY = "NOT_CLOSED";
  }

  save(report);
  console.log(JSON.stringify({ REFERENCE_AUTHORITY: report.REFERENCE_AUTHORITY, results, fail: fail || null }, null, 2));
  process.exit(fail ? 1 : closed ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "CUT3B_REFERENCE", error: String(e?.message || e) }));
  process.exit(2);
});
