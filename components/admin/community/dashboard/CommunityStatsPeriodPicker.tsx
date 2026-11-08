"use client";

/**
 * 기간 선택 (오늘 / 최근 7일 / 최근 30일 / 직접 지정) — 대시보드 「기간 통계」·운영 통계 공용.
 * 값은 URL(`period`, `from`, `to`)에 둔다. 날짜는 필리핀 시간 기준 (서버가 [from, to) 로 바꾼다).
 */
import { useState } from "react";
import { CommunityFilterField, CommunitySelect } from "@/components/admin/community/kit/CommunityAdminKit";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: "today", labelKey: "admin_community_period_today" },
  { value: "7d", labelKey: "admin_community_period_7d" },
  { value: "30d", labelKey: "admin_community_period_30d" },
  { value: "custom", labelKey: "admin_community_period_custom" },
];

const FIELD =
  "rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary";

export function CommunityStatsPeriodPicker({
  period,
  from,
  to,
  onChange,
}: {
  period: string;
  from: string;
  to: string;
  onChange: (v: { period: string; from: string; to: string }) => void;
}) {
  const { t } = useI18n();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [custom, setCustom] = useState(period === "custom");
  const value = custom ? "custom" : period || "7d";
  return (
    <CommunityFilterField label={t("admin_community_period_label_pht")}>
      <div className="flex flex-wrap items-center gap-1">
        <CommunitySelect
          value={value}
          onChange={(p) => {
            if (p === "custom") {
              setCustom(true);
              return;
            }
            setCustom(false);
            onChange({ period: p, from: "", to: "" });
          }}
          options={OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        />
        {value === "custom" ? (
          <>
            <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className={FIELD} />
            <span className="text-sam-muted">~</span>
            <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className={FIELD} />
            <AdminActionButton
              variant="secondary"
              disabled={!draftFrom || !draftTo || draftFrom > draftTo}
              onClick={() => onChange({ period: "custom", from: draftFrom, to: draftTo })}
            >
              {t("admin_community_stats_period_apply")}
            </AdminActionButton>
          </>
        ) : null}
      </div>
    </CommunityFilterField>
  );
}
