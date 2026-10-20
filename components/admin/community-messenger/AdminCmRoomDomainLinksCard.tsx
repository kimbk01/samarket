"use client";

/**
 * 채팅 Admin R1 (B) — 통합 CM 상세의 「채팅 유형 + 연결 도메인」 카드.
 * 주문 → `/admin/stores/orders/{id}` · 주문 채팅, 거래 → 거래 채팅 관리 · 거래 운영. 모두 returnTo 유지.
 */
import Link from "next/link";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  adminStoreOrderChatHref,
  adminStoreOrderDetailHref,
  adminTradeChatDetailHref,
  adminTradeFlowHref,
  adminStoreOrderAppPaths,
  publicTradePostPath,
  type AdminCmRoomDomain,
  type AdminCmRoomDomainRef,
} from "@/lib/admin-community-messenger/room-domain-links";

const DOMAIN_KEY: Record<AdminCmRoomDomain, MessageKey> = {
  trade: "admin_chat_r1b_domain_trade",
  store_order: "admin_chat_r1b_domain_store_order",
  general_direct: "admin_chat_r1b_domain_general_direct",
  group: "admin_chat_r1b_domain_group",
  unknown: "admin_chat_r1b_domain_unknown",
};

export function adminCmDomainLabelKey(domain: string | null | undefined): MessageKey {
  const d = (domain ?? "") as AdminCmRoomDomain;
  return DOMAIN_KEY[d] ?? DOMAIN_KEY.unknown;
}

const LINK_CLASS =
  "rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted";

export function AdminCmRoomDomainLinksCard({
  domainRef,
  here,
}: {
  domainRef: AdminCmRoomDomainRef | null | undefined;
  /** 현재 화면 경로 — 도메인 화면에서 돌아올 returnTo */
  here: string | null;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (key: string, path: string) => {
    void navigator.clipboard?.writeText(path).then(
      () => setCopied(key),
      () => setCopied(null)
    );
  };
  const ref = domainRef ?? { domain: "unknown" as const, storeOrderId: null, tradeLegacyRoomId: null, tradePostId: null };
  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      data-admin-cm-domain={ref.domain}
      aria-label={t("admin_chat_r1b_related_title")}
    >
      <p className="sam-text-helper text-sam-muted">{t("admin_chat_r1b_domain_label")}</p>
      <p className="sam-text-body font-semibold text-sam-fg">{t(DOMAIN_KEY[ref.domain])}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ref.storeOrderId ? (
          <>
            <Link href={adminStoreOrderDetailHref(ref.storeOrderId, here)} className={LINK_CLASS}>
              {t("admin_chat_r1b_link_order")}
            </Link>
            <Link href={adminStoreOrderChatHref(ref.storeOrderId, here)} className={LINK_CLASS}>
              {t("admin_chat_r1b_link_order_chat")}
            </Link>
          </>
        ) : null}
        {ref.tradeLegacyRoomId ? (
          <Link href={adminTradeChatDetailHref(ref.tradeLegacyRoomId, here)} className={LINK_CLASS}>
            {t("admin_chat_r1b_link_trade_chat")}
          </Link>
        ) : null}
        {ref.tradePostId ? (
          <>
            <Link href={adminTradeFlowHref(ref.tradePostId, here)} className={LINK_CLASS}>
              {t("admin_chat_r1b_link_trade_flow")}
            </Link>
            <a href={publicTradePostPath(ref.tradePostId)} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
              {t("admin_chat_link_public_post")}
            </a>
          </>
        ) : null}
      </div>
      {ref.storeOrderId ? (
        <div className="mt-3 space-y-1 border-t border-sam-border-soft pt-3" data-admin-cm-app-paths>
          <p className="sam-text-helper text-sam-muted">{t("admin_chat_app_paths_notice")}</p>
          {(
            [
              ["owner", t("admin_chat_app_path_owner"), adminStoreOrderAppPaths(ref.storeOrderId).owner],
              ["buyer", t("admin_chat_app_path_buyer"), adminStoreOrderAppPaths(ref.storeOrderId).buyer],
            ] as const
          ).map(([key, label, path]) => (
            <div key={key} className="flex flex-wrap items-center gap-2 sam-text-helper">
              <span className="text-sam-muted">{label}</span>
              <code className="rounded bg-sam-surface-muted px-1.5 py-0.5">{path}</code>
              <AdminActionButton variant="ghost" size="sm" onClick={() => copy(key, path)}>
                {copied === key ? t("admin_chat_copied") : t("admin_chat_copy")}
              </AdminActionButton>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
