"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getLaunchReadinessAreasList } from "@/lib/launch-readiness/launch-readiness-summary";
import { LaunchAreaCard } from "./LaunchAreaCard";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";
import { getPhaseLabel } from "@/lib/launch-readiness/launch-readiness-utils";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const LAUNCH_PHASES = ["pre_launch", "launch_day", "post_launch"] as const;
const PHASE_EXTRAS = ["phase"] as const;

export function LaunchAreaBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 단계 선택은 주소(`?phase=`)에 보존 (R7). 기본 Pre-Launch. */
  const lq = useAdminListQuery({ extras: PHASE_EXTRAS, extraDefaults: { phase: "pre_launch" } });
  const phase: LaunchReadinessPhase = (LAUNCH_PHASES as readonly string[]).includes(lq.query.extras.phase)
    ? (lq.query.extras.phase as LaunchReadinessPhase)
    : "pre_launch";
  const areas = useMemo(
    () => getLaunchReadinessAreasList(phase),
    [phase]
  );

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect
          ko={ko}
          label={t("admin_launch_readiness_k0e685c7c")}
          name="phase"
          includeAll={false}
          value={phase}
          onChange={(v) => lq.setExtra("phase", v)}
          options={LAUNCH_PHASES.map((p) => ({ value: p, label: getPhaseLabel(p) }))}
        />
      </AdminFilterBar>

      {areas.length === 0 ? (
        <AdminEmptyState ko={ko} message={"영역별 데이터가 없습니다."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((entry) => (
            <LaunchAreaCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
