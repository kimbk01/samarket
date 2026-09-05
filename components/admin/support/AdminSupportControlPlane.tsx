"use client";

/**
 * ARO-OPS-UX-002-B6 — Support / Notification Control Plane (read-only composition).
 * Existing AdminSupportPage remains the case workspace; this plane surfaces Action Required first.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  SupportActionRow,
  SupportControlPlaneModel,
} from "@/lib/admin/support-control-plane/types";

function Unavail({ ko }: { ko: boolean }) {
  return (
    <span className="rounded-ui-rect border border-amber-600 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900">
      {ko ? "확인 불가" : "UNAVAILABLE"}
    </span>
  );
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
    <section className="space-y-2" data-admin-support-section={id} id={id}>
      <h2 className="sam-text-body font-semibold text-sam-fg">{title}</h2>
      {children}
    </section>
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
  return (
    <div
      className="flex min-h-[9rem] flex-col justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3"
      data-admin-support-action={item.requesterType}
      data-status={item.status}
      data-case-id={item.id}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 text-[10px] font-bold">
            {item.requesterType === "OWNER" ? (ko ? "Owner" : "Owner") : ko ? "회원" : "Member"}
          </span>
          <span className="sam-text-xxs text-sam-muted">{item.publicCaseNo}</span>
          <span className="sam-text-xxs text-sam-muted">{item.category}</span>
          <span className="sam-text-xxs font-semibold text-amber-900">
            {ko ? item.ageLabelKo : item.ageLabelEn}
          </span>
        </div>
        <p className="text-[15px] font-semibold text-sam-fg">{item.subject}</p>
        <p className="sam-text-helper text-sam-muted">
          {item.status}
          {item.referenceType ? ` · ${item.referenceType}` : ""}
          {!item.assignedAdminId ? (ko ? " · 미배정" : " · Unassigned") : ""}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(item.id)}
            className="rounded-ui-rect bg-sam-fg px-3 py-1.5 text-[12px] font-semibold text-sam-app"
          >
            {ko ? "답변/처리" : "Reply"}
          </button>
        ) : (
          <Link
            href={item.href}
            className="rounded-ui-rect bg-sam-fg px-3 py-1.5 text-[12px] font-semibold text-sam-app"
          >
            {ko ? "답변/처리" : "Reply"}
          </Link>
        )}
        {item.contextHref ? (
          <Link
            href={item.contextHref}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
          >
            {ko ? item.contextLabelKo || "원본" : item.contextLabelEn || "Context"}
          </Link>
        ) : null}
        {item.statementHref ? (
          <Link
            href={item.statementHref}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
          >
            Statement
          </Link>
        ) : null}
        {item.financeHref ? (
          <Link
            href={item.financeHref}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
          >
            Finance
          </Link>
        ) : null}
        {item.adsHref ? (
          <Link
            href={item.adsHref}
            className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px] font-semibold text-sam-fg"
          >
            Ads
          </Link>
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
  const { language } = useI18n();
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
        {ko ? "고객지원 관제를 불러오는 중…" : "Loading support control plane…"}
      </p>
    );
  }

  if (error && !model) {
    return (
      <p
        className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950"
        data-admin-support-control-plane="error"
      >
        {ko ? "고객지원 관제를 불러오지 못했습니다." : "Could not load support control plane."} (
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
            <h1 className="text-xl font-semibold text-sam-fg">
              {ko ? "고객지원 / 알림 관제" : "Support / Notification Control Plane"}
            </h1>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">
              {ko
                ? "문의 Case → 답변 → 해결. Messenger와 분리. 답변 ≠ 해결."
                : "Case → reply → resolve. Separate from Messenger. Reply ≠ resolve."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-helper font-medium text-sam-fg"
          >
            {ko ? "새로고침" : "Refresh"}
          </button>
        </div>
        {model.sectionErrors.length > 0 ? (
          <p className="sam-text-helper text-amber-800">
            {ko ? "일부 소스 확인 불가" : "Some sources unavailable"}: {model.sectionErrors.join(" · ")}
          </p>
        ) : null}
      </header>

      <Section id="action-required" title={ko ? "지금 답변할 문의" : "Action required"}>
        {model.actionRequired.length === 0 ? (
          <p className="rounded-ui-rect border border-dashed border-sam-border px-4 py-6 text-center text-sam-muted">
            {ko ? "지금 처리할 문의가 없습니다." : "No support cases need action right now."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {model.actionRequired.map((item) => (
              <ActionCard key={item.id} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 sam-text-body-secondary">
          {(
            [
              ["actionable", q.actionable],
              ["member", q.member],
              ["owner", q.owner],
              ["waiting_user", q.waitingUser],
              ["resolved", q.resolved],
            ] as const
          ).map(([k, s]) => (
            <Link key={k} href={s.href} className="text-signature hover:underline" data-admin-support-queue={k}>
              {k}: {s.unavailable ? <Unavail ko={ko} /> : (s.count ?? 0)}
            </Link>
          ))}
        </div>
      </Section>

      <Section id="member-inquiries" title={ko ? "회원 문의" : "Member inquiries"}>
        {model.memberInquiries.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{ko ? "0건" : "0"}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {model.memberInquiries.slice(0, 6).map((item) => (
              <ActionCard key={`m-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="owner-inquiries" title={ko ? "Owner 문의" : "Owner inquiries"}>
        {model.ownerInquiries.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{ko ? "0건" : "0"}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {model.ownerInquiries.slice(0, 6).map((item) => (
              <ActionCard key={`o-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="aging" title={ko ? "장기 대기 (24h+)" : "Aging (24h+)"}>
        {model.aging.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">
            {ko ? "장기 대기 문의 없음" : "No aging actionable cases"}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {model.aging.map((item) => (
              <ActionCard key={`age-${item.id}`} item={item} ko={ko} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Section>

      <Section id="entries" title={ko ? "전문 / 연결" : "Entries"}>
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
          {ko
            ? "Support ≠ Messenger. 알림은 Support SSOT가 아닙니다."
            : "Support ≠ Messenger. Notifications are not the Support SSOT."}
        </p>
      </Section>
    </div>
  );
}
