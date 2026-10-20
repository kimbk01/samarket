"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getLaunchReadinessAreasList } from "@/lib/launch-readiness/launch-readiness-summary";
import { LaunchAreaCard } from "./LaunchAreaCard";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";
import { getPhaseLabel } from "@/lib/launch-readiness/launch-readiness-utils";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

export function LaunchAreaBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [phase, setPhase] = useState<LaunchReadinessPhase>("pre_launch");
  const areas = useMemo(
    () => getLaunchReadinessAreasList(phase),
    [phase]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_launch_readiness_k0e685c7c")}</span>
        {(["pre_launch", "launch_day", "post_launch"] as const).map((p) => (
          <AdminChipButton
            key={p}
            selected={phase === p}
            onClick={() => setPhase(p)}
            >
            {getPhaseLabel(p)}
          </AdminChipButton>
        ))}
      </div>

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
