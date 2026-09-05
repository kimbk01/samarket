"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { storeRowCanSell } from "@/lib/business/store-can-sell";
import { buildOwnerManageHubSectionsFromRegistry } from "@/lib/business/owner-nav-registry";
import { parsePostgresBool } from "@/lib/community-feed/parse-postgres-bool";
import { OWNER_ADMIN_LIST_CARD_CLASS } from "@/lib/business/owner-admin-list-ui";

/** Manage tab — registry-driven business management links (P2-C). */
export function OwnerManageHubLinks({
  row,
  orderAlertsBadge = 0,
}: {
  row: StoreRow;
  orderAlertsBadge?: number;
}) {
  const { safeT } = useI18n();
  const sections = buildOwnerManageHubSectionsFromRegistry({
    storeId: row.id,
    slug: String(row.slug ?? ""),
    approvalStatus: String(row.approval_status ?? ""),
    isVisible: parsePostgresBool(row.is_visible, false),
    canSell: storeRowCanSell(row),
    orderAlertsBadge,
  });

  if (sections.length === 0) return null;

  return (
    <div className="space-y-4" data-owner-manage-hub="1">
      {sections.map((section) => (
        <section key={section.titleKey} className="space-y-2">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT(section.titleKey, {
              fallbackKo: section.titleKey,
              fallbackEn: section.titleKey,
            })}
          </h2>
          <ul className="space-y-2">
            {section.items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`${OWNER_ADMIN_LIST_CARD_CLASS} flex items-center gap-2`}
                  data-owner-manage-entry={item.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-sam-fg">
                      {safeT(item.labelKey, {
                        fallbackKo: item.labelKey,
                        fallbackEn: item.labelKey,
                      })}
                    </span>
                    {item.descriptionKey ? (
                      <span className="mt-0.5 block text-xs text-sam-muted">
                        {safeT(item.descriptionKey, {
                          fallbackKo: "",
                          fallbackEn: "",
                        })}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-sam-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
