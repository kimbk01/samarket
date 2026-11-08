"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { translateBy } from "@/lib/i18n/translate-by";

type MemberConsentPayload = {
  id: string;
  nickname: string | null;
  dibayId: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  privacyAcceptedAt: string | null;
  privacyVersion: string | null;
  ageGateStatus: string | null;
  ageAttestedAt: string | null;
  dateOfBirth: string | null;
  ageGateBasis: "legacy" | "verified" | "blocked_underage" | "missing" | "unknown";
  marketingEnabled: boolean;
  marketingConsentAt: string | null;
  marketingConsentVersion: string | null;
  marketingConsentSource: string | null;
};

type EventRow = {
  id: string;
  kind: string;
  action: string;
  source: string;
  version: string | null;
  createdAt: string;
};

function ageBasisLabel(basis: MemberConsentPayload["ageGateBasis"], ko: boolean): string {
  switch (basis) {
    case "legacy":
      return translateBy(ko ? "ko" : "en", "admin_app_existing_policy_member_age_not_recorded");
    case "verified":
      return translateBy(ko ? "ko" : "en", "admin_app_new_consent_completed_14");
    case "blocked_underage":
      return translateBy(ko ? "ko" : "en", "admin_app_blocked_under_14");
    case "missing":
      return translateBy(ko ? "ko" : "en", "admin_app_age_check_required");
    default:
      return translateBy(ko ? "ko" : "en", "admin_app_unknown");
  }
}

/** Admin Legal CMS — member consent lookup (Owner mockup admin member screen). */
export function AdminMemberConsentsPage() {
  const { t, language, safeT } = useI18n();
  const ko = language !== "en";
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [member, setMember] = useState<MemberConsentPayload | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [degraded, setDegraded] = useState<string | null>(null);

  const search = async () => {
    const id = userId.trim();
    if (!id) return;
    setLoading(true);
    setError("");
    setMember(null);
    setEvents([]);
    setDegraded(null);
    try {
      const res = await fetch(`/api/admin/member-consents?userId=${encodeURIComponent(id)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        member?: MemberConsentPayload;
        events?: EventRow[];
        degraded?: string | null;
      };
      if (!res.ok || !json.ok || !json.member) {
        setError(json.error || "load_failed");
        return;
      }
      setMember(json.member);
      setEvents(Array.isArray(json.events) ? json.events : []);
      setDegraded(json.degraded ?? null);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">
          {safeT("admin_legal_member_consents")}
        </h1>
        <Link href="/admin/app/legal" className="sam-text-body text-signature">
          {t("admin_app_legal_list")}
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[280px] flex-1 space-y-1">
          <span className="text-xs font-medium text-sam-muted">userId (uuid)</span>
          <input
            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </label>
        <AdminActionButton variant="primary" onClick={() => void search()} disabled={loading || !userId.trim()}>
          {t("admin_app_search")}
        </AdminActionButton>
      </div>

      {loading ? <AdminLoadingState ko={ko} /> : null}
      {error ? <AdminErrorState ko={ko} code={error} onRetry={() => void search()} /> : null}

      {member ? (
        <div className="space-y-3 rounded-ui-rect bg-sam-surface p-4">
          <div className="font-semibold text-sam-fg">
            {member.nickname || member.dibayId || member.id}
          </div>
          <ul className="space-y-1 sam-text-body text-sam-muted">
            <li>
              terms: {member.termsVersion ?? "—"} · {member.termsAcceptedAt ?? "—"}
            </li>
            <li>
              privacy: {member.privacyVersion ?? "—"} · {member.privacyAcceptedAt ?? "—"}
            </li>
            <li data-admin-age-basis={member.ageGateBasis}>
              age: {ageBasisLabel(member.ageGateBasis, ko)}
              {member.ageGateBasis !== "legacy" && member.ageAttestedAt ? ` · ${member.ageAttestedAt}` : ""}
              {member.dateOfBirth ? ` · DOB ${member.dateOfBirth}` : ""}
            </li>
            <li>
              marketing: {member.marketingEnabled ? "ON" : "OFF"}
              {member.marketingConsentAt ? ` · ${member.marketingConsentAt}` : ""}
              {member.marketingConsentVersion ? ` · ${member.marketingConsentVersion}` : ""}
              {member.marketingConsentSource ? ` · ${member.marketingConsentSource}` : ""}
              {member.marketingConsentSource === "existing_member_default"
                ? ` ${t("admin_app_existing_member_default_not_explicit_consent")}`
                : ""}
            </li>
          </ul>
        </div>
      ) : null}

      {member && events.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={
            degraded
              ? t("admin_app_consent_events_table_is_not_ready")
              : t("admin_app_no_consent_events")
          }
        />
      ) : null}

      {events.length > 0 ? (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="rounded-ui-rect bg-sam-surface p-3 sam-text-body">
              <div className="font-medium text-sam-fg">
                {ev.kind} · {ev.action} · {ev.source}
              </div>
              <div className="text-sam-muted">
                {ev.createdAt}
                {ev.version ? ` · ${ev.version}` : ""}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
