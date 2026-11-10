"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerCareAdminNotesList } from "@/components/business/owner/OwnerCareAdminNotesList";
import { SupportGenericHubInquireGate } from "@/components/support/SupportGenericHubInquireGate";
import { SupportCasesHistoryList } from "@/components/support/SupportCasesHistoryList";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DISABLED_SUPPORT_CONTEXT, buildOwnerSupportContext } from "@/lib/support/support-context";
import { OWNER_ADMIN_PRIMARY_BTN_CLASS } from "@/lib/business/owner-admin-list-ui";

type CareTab = "history" | "archive";

function parseTab(raw: string | null): CareTab {
  return raw === "archive" || raw === "messages" || raw === "inquiries" ? "archive" : "history";
}

/**
 * A2-1 Owner Customer Center — Support Modal entry + support history; legacy archive read-only.
 */
export function OwnerCustomerCenterView({
  inboxUnread = 0,
  inquiryUnread = 0,
}: {
  inboxUnread?: number;
  inquiryUnread?: number;
}) {
  const { safeT } = useI18n();
  const sp = useSearchParams();
  const storeId = sp.get("storeId")?.trim() || null;
  const tab = parseTab(sp.get("tab"));
  const archiveBadge = inboxUnread + inquiryUnread;
  // 고객센터 답변 숫자는 고객센터 FAB 아이콘에만(Owner 2026-11-10) — 「내 문의」 탭에는 숫자 없음.
  const historyBadge = 0;

  const supportCtx = storeId
    ? buildOwnerSupportContext({
        enabled: false,
        category: "STORE",
        sourceSurface: "owner_customer_center",
        storeId,
      })
    : DISABLED_SUPPORT_CONTEXT;

  const historyHref = (() => {
    const base = OwnerRoutes.customerCareCenter(storeId, "messages");
    // force history via tab=history by rewriting query
    const u = new URL(base, "https://local.invalid");
    u.searchParams.set("tab", "history");
    if (storeId) u.searchParams.set("storeId", storeId);
    u.searchParams.set("from", "owner-care");
    return `${u.pathname}?${u.searchParams.toString()}`;
  })();

  const archiveHref = (() => {
    const base = OwnerRoutes.customerCareCenter(storeId, "inquiries");
    const u = new URL(base, "https://local.invalid");
    u.searchParams.set("tab", "archive");
    if (storeId) u.searchParams.set("storeId", storeId);
    u.searchParams.set("from", "owner-care");
    return `${u.pathname}?${u.searchParams.toString()}`;
  })();

  const tabs: { id: CareTab; href: string; label: string; badge: number }[] = [
    {
      id: "history",
      href: historyHref,
      label: safeT("support_history_title"),
      badge: historyBadge,
    },
    {
      id: "archive",
      href: archiveHref,
      label: safeT("support_legacy_archive_title"),
      badge: archiveBadge,
    },
  ];

  const body = (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-8`} data-owner-customer-center="1" data-support-entry-ssot="1">

      {!storeId ? (
        <p className="mb-3 rounded-ui-rect border border-sam-warning/30 bg-sam-warning-soft px-3 py-2 text-sm text-sam-fg">
          {safeT("support_owner_store_required")}
        </p>
      ) : (
        <SupportGenericHubInquireGate
          audience="OWNER"
          sourceSurface="owner_customer_center"
          storeId={storeId}
          className="mb-3 w-full"
          buttonClassName={`${OWNER_ADMIN_PRIMARY_BTN_CLASS} w-full min-h-11`}
          inquireDataAttr="data-owner-support-inquire"
        />
      )}

      <div className="mb-3 grid min-w-0 grid-cols-2 gap-2" data-owner-customer-center-tabs="1">
        {tabs.map((t) => {
          const selected = tab === t.id;
          return (
            <Link
              key={t.id}
              href={t.href}
              data-owner-care-tab={t.id}
              className={`flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-ui-rect px-2 text-center text-sm font-medium ${
                selected ? "bg-signature text-sam-on-primary" : "border border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              <span className="truncate">{t.label}</span>
              {t.badge > 0 ? (
                <span
                  className={`inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    selected ? "bg-sam-on-primary/20 text-sam-on-primary" : "bg-sam-danger text-sam-on-primary"
                  }`}
                >
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {tab === "history" ? (
        storeId ? (
          <SupportCasesHistoryList audience="OWNER" storeId={storeId} />
        ) : (
          <p className="text-sm text-sam-muted">
            {safeT("support_owner_store_required")}
          </p>
        )
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-sam-muted">
            {safeT("support_legacy_archive_hint")}
          </p>
          <OwnerCareAdminNotesList
            kind="inquiry"
            threadBasePath={OwnerRoutes.customerCareCsInquiries(storeId).split("?")[0]!}
            readOnly
          />
          <OwnerCareAdminNotesList
            kind="inbox"
            threadBasePath={OwnerRoutes.customerCareMessages(storeId).split("?")[0]!}
            readOnly
          />
        </div>
      )}
    </div>
  );

  if (!storeId) return body;
  return <SupportContextProvider value={supportCtx}>{body}</SupportContextProvider>;
}
