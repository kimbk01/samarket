/**
 * Phase B read-only — dump Chat / Notification / Unified App Icon Authority.
 * Uses buildDomainBadgeAuthorityHttpPayload (Formula SSOT). DO NOT heal.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDomainBadgeAuthorityHttpPayload } from "@/lib/notifications/pipeline/build-domain-badge-authority-http";

const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const OUT_DIR = join(process.cwd(), ".qa-logs/badge-ssot-phase4/chat-notification-split-phase-a");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("missing supabase env");

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const p = await buildDomainBadgeAuthorityHttpPayload(sb, VIEWER);
  const u = p.unifiedAttention;
  const out = {
    generated_at: new Date().toISOString(),
    phase: "B_formula_runtime_proof",
    viewer: VIEWER,
    projection: p.projection,
    unifiedAttention: u,
    excludedChatMessageEventIds: u.notification.excludedChatMessageEventIds,
    domainAppIcon: p.domainAppIcon,
    notificationAttentionTotal: p.notificationAttentionTotal,
    unreadApprovedNotificationEvents_rawIncludingChat: p.unreadApprovedNotificationEvents,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, "phase-b-formula-runtime.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        path,
        chatTotal: u.chat.total,
        notificationTotal: u.notification.total,
        appIconTotal: u.appIconTotal,
        bellTotal: p.projection.bellTotal,
        excludedChatEvents: u.notification.excludedChatMessageEventIds.length,
        identity:
          u.appIconTotal === u.chat.total + u.notification.total &&
          p.projection.appIconTotal === u.appIconTotal &&
          p.projection.bellTotal === u.notification.total,
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
