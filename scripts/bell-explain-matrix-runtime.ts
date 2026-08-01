/**
 * Phase 3-1 — Bell Explain Matrix Runtime
 *
 * Proves: bellTotal === Explain.total === sum(kinds) === |eventIds|
 *
 *   npx tsx --env-file=.env.local scripts/bell-explain-matrix-runtime.ts
 *
 * DO NOT: Badge · RoomUnread · Heal · Legacy · digit hacks
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import {
  assertBellExplainMatrix,
  listBellExplainEventIds,
} from "@/lib/notifications/bell-explain-matrix";
import { fetchNotificationEventsForInbox } from "@/lib/notifications/inbox-events-merge";

const OUT = join(process.cwd(), ".qa-logs/badge-ssot-phase3");
mkdirSync(OUT, { recursive: true });
const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  invalidateNotificationBadgeCache(VIEWER);
  const payload = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
  const matrix = payload.bellExplainMatrix;
  const bellTotal = payload.projection.bellTotal;
  const asserted = assertBellExplainMatrix(matrix, {
    expectedBellTotal: bellTotal,
    requireEventIds: true,
  });

  // Inbox unread ID set (full surface) — Phase 3-4 identity; 3-1 records delta only
  const inboxUnread = (
    await fetchNotificationEventsForInbox(sb, VIEWER, {
      fetchUpper: 500,
    })
  ).filter((r) => r.is_read === false);

  const explainIds = new Set(listBellExplainEventIds(matrix));
  const inboxIds = new Set(inboxUnread.map((r) => r.id));
  const onlyExplain = [...explainIds].filter((id) => !inboxIds.has(id));
  const onlyInbox = [...inboxIds].filter((id) => !explainIds.has(id));
  // Inbox may include dismissed filters differently — compare digit-eligible only:
  // Phase 3-1 gate: Explain.total == bellTotal; list identity is Phase 3-4.
  const listNote = {
    inboxUnreadCount: inboxUnread.length,
    explainCount: explainIds.size,
    onlyExplainSample: onlyExplain.slice(0, 10),
    onlyInboxSample: onlyInbox.slice(0, 10),
  };

  const pass = asserted.ok && matrix.total === bellTotal;

  const report = {
    generated_at: new Date().toISOString(),
    phase: "3-1",
    authority: matrix.authority,
    pass,
    viewer: VIEWER,
    bellTotal,
    explain: {
      total: matrix.total,
      generalMessage: matrix.generalMessage.count,
      groupMessage: matrix.groupMessage.count,
      tradeMessage: matrix.tradeMessage.count,
      customerOrder: matrix.customerOrder.count,
      ownerOrder: matrix.ownerOrder.count,
      tradeStatus: matrix.tradeStatus.count,
      orderStatus: matrix.orderStatus.count,
      missedCall: matrix.missedCall.count,
      systemAdmin: matrix.systemAdmin.count,
      excludedFromDigit: matrix.excludedFromDigit.count,
    },
    eventIdCounts: {
      generalMessage: matrix.generalMessage.eventIds.length,
      groupMessage: matrix.groupMessage.eventIds.length,
      tradeMessage: matrix.tradeMessage.eventIds.length,
      customerOrder: matrix.customerOrder.eventIds.length,
      ownerOrder: matrix.ownerOrder.eventIds.length,
      tradeStatus: matrix.tradeStatus.eventIds.length,
      orderStatus: matrix.orderStatus.eventIds.length,
      missedCall: matrix.missedCall.eventIds.length,
      systemAdmin: matrix.systemAdmin.eventIds.length,
    },
    asserted,
    listNote,
    // Badge LOCK neighbor — must remain explainable independently
    badgeLockNeighbor: {
      appIconTotal: payload.projection.appIconTotal,
      badgeExplainAppIcon: payload.explainMatrix.appIcon.total,
    },
  };

  writeFileSync(join(OUT, "bell-explain-matrix-runtime.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        bellTotal,
        explain: report.explain,
        errors: asserted.errors,
      },
      null,
      2
    )
  );
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
