"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import { philifeAppPaths } from "@domain/philife/paths";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { DibayActionSheet } from "@/components/ui/dibay-overlay";

export function CommunityComposeSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  sectionSlug?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const requireAuth = useRequireAuthAction();

  const writeHref = philifeAppPaths.write;
  const writeMeetingHref = philifeAppPaths.writeMeeting;

  return (
    <DibayActionSheet
      open={open}
      onClose={onClose}
      title={t("community_compose_prompt")}
      cancelLabel={t("community_compose_cancel")}
      anchor="above-bottom-nav"
      items={[
        {
          key: "messenger",
          label: t("community_compose_ask_bot"),
          onClick: () => {
            void requireAuth(
              "messenger_open",
              () => {
                router.push(TRADE_CHAT_SURFACE.messengerListHref);
              },
              { next: TRADE_CHAT_SURFACE.messengerListHref },
            );
          },
        },
        {
          key: "write",
          label: t("community_compose_write"),
          onClick: () => {
            void requireAuth(
              "community_write",
              () => {
                router.push(writeHref);
              },
              { next: writeHref },
            );
          },
        },
        {
          key: "meeting",
          label: t("community_compose_create_meeting"),
          onClick: () => {
            void requireAuth(
              "community_write",
              () => {
                router.push(writeMeetingHref);
              },
              { next: writeMeetingHref },
            );
          },
        },
      ]}
    />
  );
}
