"use client";

import { MANNER_POLICY_VERSION, MANNER_WINDOW_DAYS } from "@/lib/trust/manner-battery-policy-v1";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * Manner Battery SSOT flow (admin diagram) — ledger → policy → calculator → snapshot.
 */
export function BatteryPolicyFlowDiagram() {
  const { t } = useI18n();
  return (
    <svg viewBox="0 0 760 132" className="h-auto w-full max-w-4xl" aria-hidden>
      <title>{t("admin_settings_battery_diagram_title")}</title>
      <defs>
        <marker id="arrowTrust" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="var(--sam-text-muted)" />
        </marker>
      </defs>

      <rect x="8" y="24" width="132" height="52" rx="8" fill="var(--sam-primary-soft)" stroke="var(--sam-primary-border)" strokeWidth="1.5" />
      <text x="74" y="46" textAnchor="middle" fill="var(--sam-text-primary)" fontSize="11" fontWeight="600">
        trust_events
      </text>
      <text x="74" y="62" textAnchor="middle" fill="var(--sam-text-muted)" fontSize="9">
        {t("admin_settings_battery_diagram_events_sub")}
      </text>

      <line x1="140" y1="50" x2="178" y2="50" stroke="var(--sam-icon-soft)" strokeWidth="1.5" markerEnd="url(#arrowTrust)" />

      <rect x="182" y="18" width="188" height="64" rx="8" fill="var(--sam-warning-soft)" stroke="var(--sam-warning)" strokeWidth="1.5" />
      <text x="276" y="40" textAnchor="middle" fill="var(--sam-text-primary)" fontSize="11" fontWeight="600">
        {MANNER_POLICY_VERSION}
      </text>
      <text x="276" y="56" textAnchor="middle" fill="var(--sam-text-secondary)" fontSize="9">
        {`${MANNER_WINDOW_DAYS}d window · ×1.0`}
      </text>
      <text x="276" y="70" textAnchor="middle" fill="var(--sam-text-secondary)" fontSize="9">
        trade ACTIVE
      </text>

      <line x1="370" y1="50" x2="408" y2="50" stroke="var(--sam-icon-soft)" strokeWidth="1.5" markerEnd="url(#arrowTrust)" />

      <rect x="412" y="22" width="128" height="56" rx="8" fill="var(--sam-info-soft)" stroke="var(--sam-info)" strokeWidth="1.5" />
      <text x="476" y="44" textAnchor="middle" fill="var(--sam-text-primary)" fontSize="11" fontWeight="600">
        calculator
      </text>
      <text x="476" y="60" textAnchor="middle" fill="var(--sam-text-secondary)" fontSize="9">
        bounded_evidence
      </text>

      <line x1="540" y1="50" x2="578" y2="50" stroke="var(--sam-icon-soft)" strokeWidth="1.5" markerEnd="url(#arrowTrust)" />

      <rect x="582" y="26" width="170" height="48" rx="8" fill="var(--sam-success-soft)" stroke="var(--sam-success)" strokeWidth="1.5" />
      <text x="667" y="48" textAnchor="middle" fill="var(--sam-text-primary)" fontSize="11" fontWeight="600">
        member_trust_snapshots
      </text>
      <text x="667" y="62" textAnchor="middle" fill="var(--sam-text-muted)" fontSize="9">
        Manner Battery %
      </text>

      <text x="8" y="118" fill="var(--sam-text-muted)" fontSize="10">
        {t("admin_settings_battery_diagram_footer")}
      </text>
    </svg>
  );
}
