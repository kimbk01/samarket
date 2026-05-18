"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { MessageKey } from "@/lib/i18n/messages";

type HubCard = {
  href: string;
  titleKey: MessageKey;
  descriptionKey: MessageKey;
  noteKey?: MessageKey;
};

type HubSection = {
  titleKey: MessageKey;
  items: HubCard[];
};

const SECTIONS: HubSection[] = [
  {
    titleKey: "admin_trade_hub_section_menu_chips",
    items: [
      {
        href: "/admin/trade/settings",
        titleKey: "admin_menu_trade_settings",
        descriptionKey: "admin_trade_hub_desc_settings",
      },
      {
        href: "/admin/menus/trade",
        titleKey: "admin_menu_menu_trade",
        descriptionKey: "admin_trade_hub_desc_menu_trade",
      },
    ],
  },
  {
    titleKey: "admin_trade_hub_section_feed_topics",
    items: [
      {
        href: "/admin/trade/feed-topics",
        titleKey: "admin_menu_trade_topics",
        descriptionKey: "admin_trade_hub_desc_feed_topics",
      },
    ],
  },
  {
    titleKey: "admin_trade_hub_section_posts_products",
    items: [
      {
        href: "/admin/products",
        titleKey: "admin_menu_trade_products",
        descriptionKey: "admin_trade_hub_desc_products",
      },
      {
        href: "/admin/posts-management",
        titleKey: "admin_menu_posts_management",
        descriptionKey: "admin_trade_hub_desc_posts_management",
      },
    ],
  },
  {
    titleKey: "admin_trade_hub_section_favorites_offers",
    items: [
      {
        href: "/admin/favorites",
        titleKey: "admin_menu_trade_likes",
        descriptionKey: "admin_trade_hub_desc_favorites",
      },
      {
        href: "/admin/price-offers",
        titleKey: "admin_menu_trade_offers",
        descriptionKey: "admin_trade_hub_desc_offers",
        noteKey: "admin_trade_hub_note_route_404",
      },
      {
        href: "/admin/trade-status",
        titleKey: "admin_menu_trade_status",
        descriptionKey: "admin_trade_hub_desc_trade_status",
        noteKey: "admin_trade_hub_note_page_prep",
      },
    ],
  },
  {
    titleKey: "admin_trade_hub_section_chat_flow",
    items: [
      {
        href: "/admin/chats/trade",
        titleKey: "admin_menu_chat_trade",
        descriptionKey: "admin_trade_hub_desc_trade_chat",
      },
      {
        href: "/admin/trade-flow",
        titleKey: "admin_menu_chat_flow",
        descriptionKey: "admin_trade_hub_desc_trade_flow",
      },
    ],
  },
  {
    titleKey: "admin_trade_hub_section_reviews_ads",
    items: [
      {
        href: "/admin/reviews",
        titleKey: "admin_menu_trade_reviews",
        descriptionKey: "admin_trade_hub_desc_reviews",
      },
      {
        href: "/admin/post-ads",
        titleKey: "admin_menu_ads_posts",
        descriptionKey: "admin_trade_hub_desc_post_ads",
      },
      {
        href: "/admin/trade-post-ads",
        titleKey: "admin_menu_trade_post_ads",
        descriptionKey: "admin_trade_hub_desc_trade_post_ads",
      },
      {
        href: "/admin/trade-ad-policies",
        titleKey: "admin_menu_trade_ad_policies",
        descriptionKey: "admin_trade_hub_desc_ad_policies",
      },
      {
        href: "/admin/home-feed",
        titleKey: "admin_menu_ads_home_feed",
        descriptionKey: "admin_trade_hub_desc_home_feed",
      },
    ],
  },
];

export function AdminTradeHub() {
  const { t } = useI18n();
  const sections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        title: t(section.titleKey),
        items: section.items.map((card) => ({
          href: card.href,
          title: t(card.titleKey),
          description: t(card.descriptionKey),
          note: card.noteKey ? t(card.noteKey) : undefined,
        })),
      })),
    [t]
  );

  return (
    <div className="space-y-6" data-admin>
      <AdminPageHeader titleKey="admin_menu_trade_hub" descriptionKey="admin_trade_hub_desc" />
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-2 sam-text-body-secondary font-semibold uppercase tracking-wide text-sam-muted">
              {section.title}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {section.items.map((card) => (
                <li key={card.href}>
                  <Link
                    href={card.href}
                    className="block h-full rounded-ui-rect border border-sam-border bg-sam-surface p-4 sam-text-body shadow-sm transition hover:border-signature/40 hover:bg-sam-app/80"
                  >
                    <span className="font-medium text-sam-fg">{card.title}</span>
                    <p className="mt-1 sam-text-body-secondary text-sam-muted">{card.description}</p>
                    {card.note ? <p className="mt-1 sam-text-xxs text-amber-800/90">{card.note}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
