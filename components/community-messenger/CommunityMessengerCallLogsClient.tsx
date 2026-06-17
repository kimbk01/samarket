"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessengerCallLogsPanel } from "@/components/community-messenger/MessengerCallLogsPanel";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DetailHeader } from "@/components/layout/sector-header";
import {
  messengerInboxHrefWithOrigin,
  parseMessengerEntryOrigin,
  readStoredMessengerEntryOrigin,
} from "@/lib/community-messenger/messenger-entry-origin";

export function CommunityMessengerCallLogsClient() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = parseMessengerEntryOrigin(searchParams.get("from"));
  const inboxHref = messengerInboxHrefWithOrigin(fromUrl ?? readStoredMessengerEntryOrigin());

  return (
    <div className="flex min-h-[100dvh] flex-col bg-sam-app">
      <DetailHeader
        title={t("cm_ui_call_logs_title")}
        onBack={() => router.back()}
        rightSlot={
          <Link
            href={inboxHref}
            className="sam-text-body-secondary shrink-0 px-1 text-signature active:opacity-80"
          >
            {t("nav_conversation")}
          </Link>
        }
      />

      <main className="flex-1 px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        <MessengerCallLogsPanel entryOrigin={fromUrl ?? readStoredMessengerEntryOrigin()} />
      </main>
    </div>
  );
}
