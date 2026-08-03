/**
 * Phase B read-only — dump canonical Conversation B / Notification A / App Icon Authority.
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
  const out = {
    generated_at: new Date().toISOString(),
    phase: "B_formula_runtime_proof",
    viewer: VIEWER,
    projection: p.projection,
    memberAppIconAuthority: p.memberAppIconAuthority,
    memberConversationAuthority: p.memberConversationAuthority,
    bellExplainMatrix: p.bellExplainMatrix,
    explainMatrix: p.explainMatrix,
    domainAppIcon: p.domainAppIcon,
    memberUnreadNotificationCount: p.memberUnreadNotificationCount,
    unreadApprovedNotificationEvents_rawIncludingChat: p.unreadApprovedNotificationEvents,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, "phase-b-formula-runtime.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        path,
        chatTotal: p.memberConversationUnreadRooms,
        notificationTotal: p.memberUnreadNotificationCount,
        appIconTotal: p.memberAppIconAuthority.appIconTotal,
        bellTotal: p.projection.bellTotal,
        excludedFromBell: p.bellExplainMatrix.excludedFromDigit.count,
        identity:
          p.memberAppIconAuthority.appIconTotal ===
            p.memberConversationUnreadRooms + p.memberUnreadNotificationCount &&
          p.projection.appIconTotal === p.memberAppIconAuthority.appIconTotal &&
          p.projection.bellTotal === p.memberUnreadNotificationCount,
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
