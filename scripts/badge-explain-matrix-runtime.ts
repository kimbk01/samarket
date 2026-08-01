#!/usr/bin/env node
/**
 * Phase 2-1 — Badge Explain Matrix Runtime
 *
 * Proves App Icon / Bottom / Trade / Customer / Owner = ID set + count
 * against live Domain badge authority payload.
 *
 *   node --env-file=.env.local scripts/badge-explain-matrix-runtime.mjs
 *
 * DO NOT: Bell · RoomUnread · Heal · Native · Writer SSOT (Phase 2-2+)
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";
import { assertBadgeExplainMatrix } from "@/lib/notifications/badge-explain-matrix";

const OUT = join(process.cwd(), ".qa-logs/badge-ssot-phase2");
mkdirSync(OUT, { recursive: true });

const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const ROUNDS = Number(process.env.BADGE_EXPLAIN_ROUNDS || 3);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function oneRound(round: number) {
  const payload = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
  const matrix = payload.explainMatrix;
  const asserted = assertBadgeExplainMatrix(matrix, {
    expectedAppIconTotal: payload.projection.appIconTotal,
    expectedBottomTotal: payload.projection.bottomChatTotal,
    expectedTradeTotal: payload.domainUnreadRooms.trade,
    expectedCustomerTotal: payload.storeOrderBuyerDeliveryUnread,
    expectedOwnerTotal: payload.storeOrderOwnerChatUnread,
    requireMissedCallEventIds: matrix.appIcon.missedCall.count > 0,
  });

  // Extra: projection.appIcon parts vs explain split
  const messengerExplain = matrix.appIcon.general.count + matrix.appIcon.group.count;
  const storeExplain = matrix.appIcon.customerOrder.count + matrix.appIcon.ownerOrder.count;
  const partsOk =
    payload.domainAppIcon.messenger === messengerExplain &&
    payload.domainAppIcon.trade === matrix.appIcon.trade.count &&
    payload.domainAppIcon.storeOrder === storeExplain &&
    payload.domainAppIcon.missedCall === matrix.appIcon.missedCall.count;

  const pass = asserted.ok && partsOk && matrix.appIcon.total === payload.projection.appIconTotal;

  return {
    round,
    pass,
    asserted,
    partsOk,
    summary: {
      appIcon: matrix.appIcon.total,
      bottom: matrix.bottom.total,
      trade: matrix.trade.count,
      customer: matrix.customer.count,
      owner: matrix.owner.count,
      missedCall: matrix.appIcon.missedCall.count,
      general: matrix.appIcon.general.count,
      group: matrix.appIcon.group.count,
    },
    explainMatrix: matrix,
    projection: payload.projection,
    domainAppIcon: payload.domainAppIcon,
  };
}

async function main() {
  const results = [];
  for (let r = 1; r <= ROUNDS; r++) {
    const row = await oneRound(r);
    results.push(row);
    console.log(
      `[r${r}] pass=${row.pass} appIcon=${row.summary.appIcon} bottom=${row.summary.bottom} ` +
        `G=${row.summary.general} Grp=${row.summary.group} T=${row.summary.trade} ` +
        `C=${row.summary.customer} O=${row.summary.owner} M=${row.summary.missedCall}` +
        (row.asserted.ok ? "" : ` errors=${row.asserted.errors.join("|")}`)
    );
  }

  const report = {
    generated_at: new Date().toISOString(),
    phase: "2-1",
    viewer: VIEWER,
    pass: results.every((x) => x.pass),
    results,
  };
  writeFileSync(join(OUT, "explain-matrix-runtime.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, rounds: ROUNDS }, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
