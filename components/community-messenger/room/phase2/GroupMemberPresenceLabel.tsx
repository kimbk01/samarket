"use client";

import { memo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useCommunityMessengerPeerPresence } from "@/lib/community-messenger/realtime/presence/use-community-messenger-peer-presence";

/**
 * Group member list subtitle — Presence SSOT labels only (online / away / offline).
 * Reuses existing presence runtime; no new store or polling.
 */
export const GroupMemberPresenceLabel = memo(function GroupMemberPresenceLabel({
  userId,
  fallback,
}: {
  userId: string;
  fallback: string;
}) {
  const { t } = useI18n();
  const presence = useCommunityMessengerPeerPresence(userId);
  const state = presence?.state;
  if (state === "online") return <>{t("cm_ui_online")}</>;
  if (state === "away") return <>{t("cm_ui_away")}</>;
  if (state === "offline") return <>{t("cm_ui_offline")}</>;
  return <>{fallback}</>;
});
