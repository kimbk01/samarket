"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MessengerCallLogsPanel } from "@/components/community-messenger/MessengerCallLogsPanel";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DetailHeader } from "@/components/layout/sector-header";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
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
  /** ≥768 분할 우측 패널 — 패널 높이 안에서 스크롤 (SPL-03). 휴대폰은 기존 전체 페이지 */
  const isSplit = useIsMessengerSplitViewport();

  return (
    <div
      className={
        isSplit
          ? "flex h-full min-h-0 flex-col overflow-y-auto bg-sam-app"
          : "flex min-h-[100dvh] flex-col bg-sam-app"
      }
    >
      <DetailHeader
        title={t("cm_ui_call_logs_title")}
        onBack={() => runHistoryBackWithFallback(router, inboxHref)}
        rightSlot={
          <Link
            href={inboxHref}
            className="sam-text-body-secondary shrink-0 px-1 text-signature active:opacity-80"
          >
            {t("nav_conversation")}
          </Link>
        }
      />

      <main className="flex-1 px-3 pb-[max(16px,var(--safe-bottom))] pt-2">
        <MessengerCallLogsPanel entryOrigin={fromUrl ?? readStoredMessengerEntryOrigin()} />
      </main>
    </div>
  );
}
