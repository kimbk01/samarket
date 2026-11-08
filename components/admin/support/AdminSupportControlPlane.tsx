"use client";

/**
 * ARO-OPS-UX-002-B6 — Support / Notification Control Plane (read-only composition).
 * Existing AdminSupportPage remains the case workspace; this plane surfaces Action Required first.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import {
  AdminControlPlaneEmpty,
  AdminControlPlaneSection,
} from "@/components/admin/ui/AdminControlPlaneChrome";
import { AdminToneBadge, AdminUnavailableChip } from "@/components/admin/ui/AdminToneBadge";
import type {
  SupportActionRow,
  SupportControlPlaneModel,
} from "@/lib/admin/support-control-plane/types";
import { supportAdminStatusLabel, supportAudienceLabel } from "@/lib/support/support-status-label";
import { supportCategoryLabel, supportReferenceLabel } from "@/lib/support/support-display-labels";

function Unavail({ ko }: { ko: boolean }) {
  return <AdminUnavailableChip ko={ko} />;
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AdminControlPlaneSection id={id} title={title} dataAttr="data-admin-support-section">
      {children}
    </AdminControlPlaneSection>
  );
}

function ActionCard({
  item,
  ko,
  onOpen,
}: {
  item: SupportActionRow;
  ko: boolean;
  onOpen?: (caseId: string) => void;
}) {
  const { t, safeT } = useI18n();
  return (
    <div
      className="flex min-h-[9rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
      data-admin-support-action={item.requesterType}
      data-status={item.status}
      data-case-id={item.id}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <AdminToneBadge tone={item.requesterType === "OWNER" ? "progress" : "neutral"}>
            {supportAudienceLabel(item.requesterType, ko)}
          </AdminToneBadge>
          <span className="sam-text-helper text-sam-muted">{item.publicCaseNo}</span>
          <span className="sam-text-helper text-sam-muted">
            {supportCategoryLabel(safeT, item.category)}
          </span>
          <AdminToneBadge tone="waiting">{ko ? item.ageLabelKo : item.ageLabelEn}</AdminToneBadge>
        </div>
        <p className="text-[15px] font-semibold text-sam-fg">{item.subject}</p>
        <p className="sam-text-helper text-sam-muted">
          {supportAdminStatusLabel(item.status, ko)}
          {item.referenceType ? ` · ${supportReferenceLabel(safeT, item.referenceType)}` : ""}
          {!item.assignedAdminId ? (` ${t("admin_support_unassigned_2")}`) : ""}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onOpen ? (
          <AdminActionButton variant="primary" onClick={() => onOpen(item.id)}>
            {t("admin_support_reply_2")}
          </AdminActionButton>
        ) : (
          <AdminActionLink href={item.href} variant="primary">
            {t("admin_support_reply_2")}
          </AdminActionLink>
        )}
        {item.contextHref ? (
          <AdminActionLink href={item.contextHref} variant="secondary">
            {(ko ? item.contextLabelKo : item.contextLabelEn) || t("admin_support_related_record")}
          </AdminActionLink>
        ) : null}
        {item.statementHref ? (
          <AdminActionLink href={item.statementHref} variant="secondary">
            {t("admin_support_finance_history")}
          </AdminActionLink>
        ) : null}
        {item.financeHref ? (
          <AdminActionLink href={item.financeHref} variant="secondary">
            {t("admin_support_finance")}
          </AdminActionLink>
        ) : null}
        {item.adsHref ? (
          <AdminActionLink href={item.adsHref} variant="secondary">
            {t("admin_support_ads")}
          </AdminActionLink>
        ) : null}
      </div>
    </div>
  );
}

export function AdminSupportControlPlane({
  onOpenCase,
}: {
  onOpenCase?: (caseId: string) => void;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<SupportControlPlaneModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/support-control-plane", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        plane?: SupportControlPlaneModel;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.plane) {
        setModel(null);
        setError(json.error || "load_failed");
        return;
      }
      setModel(json.plane);
    } catch {
      setModel(null);
      setError("network");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !model) {
    return (
      <p className="sam-text-body text-sam-muted" data-admin-support-control-plane="loading">
        {t("admin_support_loading_support_control_plane")}
      </p>
    );
  }

  if (error && !model) {
    return (
      <p
        className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
        data-admin-support-control-plane="error"
      >
        {t("admin_support_could_not_load_support_control_plane")} (
        {error})
      </p>
    );
  }

  if (!model) return null;
  const q = model.queues;

  return (
    <div className="space-y-5" data-admin-support-control-plane="1" data-aro-ops-ux-002-b6="1">
      <header className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="sam-text-page-title font-semibold text-sam-fg">
              {t("admin_support_support_notification_control_plane")}
            </h1>
            <p className="mt-1 sam-text-body text-sam-muted">
              {t("admin_support_case_reply_resolve_separate_from_messenger")}
            </p>
          </div>
          <AdminActionButton variant="neutral" onClick={() => void load()}>
            {t("admin_support_refresh")}
          </AdminActionButton>
        </div>
        {model.sectionErrors.length > 0 ? (
          <p className="sam-text-helper text-amber-800">
            {t("admin_support_some_sources_unavailable")}: {model.sectionErrors.join(" · ")}
          </p>
        ) : null}
      </header>

      <Section id="action-required" title={t("admin_support_action_required")}>
        {model.actionRequired.length === 0 ? (
          <AdminControlPlaneEmpty
            message={t("admin_support_no_support_cases_need_action_right")}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.actionRequired.map((item) => (
              <ActionCard key={item.id} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              [t("admin_support_waiting_reply"), "actionable", q.actionable],
              [t("admin_support_in_progress"), "in_progress", q.inProgress],
              [t("admin_support_overdue"), "overdue", q.overdue],
              [t("admin_support_member_2"), "member", q.member],
              [t("admin_support_owner"), "owner", q.owner],
              [t("admin_support_finance_2"), "finance", q.finance],
              [t("admin_support_ads_2"), "ads", q.ads],
              [t("admin_support_order"), "order", q.order],
            ] as const
          ).map(([label, k, s]) => (
            <Link
              key={k}
              href={s.href}
              className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-3 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-surface"
              data-admin-support-queue={k}
            >
              {label}
              <span className="mt-1 block tabular-nums text-sam-muted">
                {s.unavailable ? <Unavail ko={ko} /> : (s.count ?? 0)}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section id="member-inquiries" title={t("admin_support_member_inquiries")}>
        {model.memberInquiries.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_support_zero_count")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {model.memberInquiries.slice(0, 6).map((item) => (
              <ActionCard key={`m-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="owner-inquiries" title={t("admin_support_owner_inquiries")}>
        {model.ownerInquiries.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_support_zero_count")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {model.ownerInquiries.slice(0, 6).map((item) => (
              <ActionCard key={`o-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="finance-inquiries" title={t("admin_support_finance_inquiries")}>
        {(model.financeInquiries ?? []).length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_support_zero_count")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(model.financeInquiries ?? []).slice(0, 6).map((item) => (
              <ActionCard key={`f-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="ads-inquiries" title={t("admin_support_ads_inquiries")}>
        {(model.adsInquiries ?? []).length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_support_zero_count")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(model.adsInquiries ?? []).slice(0, 6).map((item) => (
              <ActionCard key={`a-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="order-inquiries" title={t("admin_support_order_inquiries")}>
        {(model.orderInquiries ?? []).length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{t("admin_support_zero_count")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {(model.orderInquiries ?? []).slice(0, 6).map((item) => (
              <ActionCard key={`ord-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="aging" title={t("admin_support_overdue_24h")}>
        {model.aging.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">
            {t("admin_support_no_overdue_actionable_cases")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {model.aging.map((item) => (
              <ActionCard key={`age-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="entries" title={t("admin_support_entries")}>
        <ul className="flex flex-wrap gap-2">
          {model.domainEntries.map((e) => (
            <li key={e.id}>
              <Link
                href={e.href}
                className="inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-semibold text-sam-fg hover:bg-sam-surface"
                data-admin-support-entry={e.id}
              >
                {ko ? e.labelKo : e.labelEn}
              </Link>
            </li>
          ))}
        </ul>
        <p className="sam-text-xxs text-sam-muted">
          {t("admin_support_support_messenger_notifications_are_not_support")}
        </p>
      </Section>
    </div>
  );
}
