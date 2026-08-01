/**
 * Phase A read-only — dump Chat room IDs + Bell event IDs for Formula split audit.
 * DO NOT implement new Formula. DO NOT mark-read / heal.
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
  const chat = {
    generalRoomIds: [...p.messengerUnreadRoomIds.general_direct],
    groupRoomIds: [...p.messengerUnreadRoomIds.group],
    tradeRoomIds: [...p.tradeUnreadRoomIds],
    customerOrderRoomIds: [...p.storeOrderUnreadRoomIds.customer],
    ownerOrderRoomIds: [...p.storeOrderUnreadRoomIds.owner],
  };
  const chatTotal =
    chat.generalRoomIds.length +
    chat.groupRoomIds.length +
    chat.tradeRoomIds.length +
    chat.customerOrderRoomIds.length +
    chat.ownerOrderRoomIds.length;

  const orphan = {
    count: p.projection.orphanMissedCallCount,
    eventIds: [...(p.explainMatrix.appIcon.missedCall.eventIds || [])],
  };

  const bell = p.bellExplainMatrix;
  const chatKinds = [
    "generalMessage",
    "groupMessage",
    "tradeMessage",
    "customerOrder",
    "ownerOrder",
  ] as const;
  const nonChatKinds = ["tradeStatus", "orderStatus", "missedCall", "systemAdmin"] as const;

  const byKind: Record<string, { count: number; eventIds: string[] }> = {};
  for (const k of [...chatKinds, ...nonChatKinds, "excludedFromDigit"] as const) {
    const part = (bell as unknown as Record<string, { count: number; eventIds: readonly string[] }>)[k];
    byKind[k] = { count: part?.count ?? 0, eventIds: [...(part?.eventIds ?? [])] };
  }

  const chatEventIds = chatKinds.flatMap((k) => byKind[k].eventIds);
  const nonChatEventIds = nonChatKinds.flatMap((k) => byKind[k].eventIds);

  const out = {
    generated_at: new Date().toISOString(),
    phase: "A_chat_notification_split_audit",
    viewer: VIEWER,
    currentImplementation: {
      appIconTotal: p.projection.appIconTotal,
      bottomChatTotal: p.projection.bottomChatTotal,
      bellTotal: p.projection.bellTotal,
      orphanMissedCallCount: orphan.count,
      domainUnreadRooms: p.domainUnreadRooms,
      domainAppIcon: p.domainAppIcon,
      nonChatEventAttention: p.nonChatEventAttention,
      categoryCounts: p.categoryCounts,
    },
    chatAttentionAsRooms: { ...chat, total: chatTotal },
    orphanMissedInAppIcon: orphan,
    notificationAttentionCandidateFromBell: {
      note: "Bell today counts eligible events including chat_message kinds; product NotificationAttention excludes chat kinds from App Icon axis",
      bellTotal: bell.total,
      byKind,
      chatMessageEventIdsInBell: chatEventIds,
      nonChatEventIdsInBell: nonChatEventIds,
      nonChatCount: nonChatEventIds.length,
    },
    productContractPreview: {
      ChatAttentionTotal: chatTotal,
      NotificationAttentionTotal_if_nonChatBellOnly: nonChatEventIds.length,
      AppIconTotal_if_chatRooms_plus_nonChatBell: chatTotal + nonChatEventIds.length,
      currentAppIconTotal: p.projection.appIconTotal,
      identity_check_chatRooms_plus_orphan_equals_appIcon:
        chatTotal + orphan.count === p.projection.appIconTotal,
      gap_current_minus_chatPlusNonChatBell:
        p.projection.appIconTotal - (chatTotal + nonChatEventIds.length),
    },
    explainMatrix: p.explainMatrix,
    bellExplainMatrix: bell,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, "authority-decompose-live.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        path,
        appIcon: out.currentImplementation.appIconTotal,
        chatTotal,
        bellTotal: bell.total,
        nonChatBell: nonChatEventIds.length,
        chatBell: chatEventIds.length,
        orphan: orphan.count,
        productPreviewAppIcon: out.productContractPreview.AppIconTotal_if_chatRooms_plus_nonChatBell,
        gap: out.productContractPreview.gap_current_minus_chatPlusNonChatBell,
        counts: {
          G: chat.generalRoomIds.length,
          Grp: chat.groupRoomIds.length,
          T: chat.tradeRoomIds.length,
          C: chat.customerOrderRoomIds.length,
          O: chat.ownerOrderRoomIds.length,
        },
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
