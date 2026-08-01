/**
 * Phase 3-2 — Bell Writer Authority Runtime
 *
 * Proves:
 * - Writer inventory authorityWriterCount === 1
 * - Bell Explain == bellTotal (Commit identity with 3-1)
 * - Trigger inventory complete (boot/RT/poll/read/status/missed/admin/legacy/fallback)
 *
 *   npx tsx --env-file=.env.local scripts/bell-writer-authority-runtime.ts
 *
 * DO NOT: Badge · RoomUnread · Event create-policy · Heal · Legacy delete · Inbox UI
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import {
  assertBellExplainMatchesDigit,
  assertBellWriterAuthorityInventory,
  BELL_COMMIT_ENTRY,
  BELL_EVENT_INSERT_SSOT,
  BELL_WRITER_AUTHORITY,
  listBellSurfaceWriterInventory,
  listBellWriterTriggerInventory,
} from "@/lib/notifications/bell-writer-authority";

const OUT = join(process.cwd(), ".qa-logs/badge-ssot-phase3");
mkdirSync(OUT, { recursive: true });
const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const ROUNDS = Number(process.env.BELL_WRITER_ROUNDS || 3);

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const inventoryAssert = assertBellWriterAuthorityInventory();
  const triggers = listBellWriterTriggerInventory();
  const surfaces = listBellSurfaceWriterInventory();

  const rounds: Array<{
    round: number;
    trigger: string;
    pass: boolean;
    errors: string[];
    bellTotal: number;
    explainTotal: number;
  }> = [];

  const triggerLabels = ["bootstrap", "poll", "reconnect", "read_ack_equiv", "foreground"] as const;
  for (let i = 0; i < ROUNDS; i++) {
    for (const trigger of triggerLabels) {
      invalidateNotificationBadgeCache(VIEWER);
      const payload = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
      const match = assertBellExplainMatchesDigit({
        bellExplainMatrix: payload.bellExplainMatrix,
        bellTotal: payload.projection.bellTotal,
      });
      rounds.push({
        round: i + 1,
        trigger,
        pass: match.ok,
        errors: match.errors,
        bellTotal: payload.projection.bellTotal,
        explainTotal: payload.bellExplainMatrix.total,
      });
      console.log(
        `[r${i + 1}:${trigger}] pass=${match.ok} bell=${payload.projection.bellTotal} explain=${payload.bellExplainMatrix.total}` +
          (match.errors.length ? ` errors=${match.errors.join("|")}` : "")
      );
    }
  }

  const roundsPass = rounds.length > 0 && rounds.every((r) => r.pass);
  const pass = inventoryAssert.ok && roundsPass;

  const report = {
    generated_at: new Date().toISOString(),
    phase: "3-2",
    authority: BELL_WRITER_AUTHORITY,
    pass,
    commitEntry: BELL_COMMIT_ENTRY,
    eventInsertSsot: BELL_EVENT_INSERT_SSOT,
    inventoryAssert,
    triggers,
    surfaces,
    rounds,
    note:
      "Bootstrap/RT/Poll/Read are rebuild triggers; THE Bell commit is applyBellBadgeProjection. Event pipelines use createNotificationEvent only.",
    badgeLockNeighbor: "Phase 2 HARD LOCK — untouched",
  };

  writeFileSync(join(OUT, "bell-writer-authority-runtime.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: report.pass,
        commitEntry: BELL_COMMIT_ENTRY,
        inventoryOk: inventoryAssert.ok,
        roundsPass,
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
