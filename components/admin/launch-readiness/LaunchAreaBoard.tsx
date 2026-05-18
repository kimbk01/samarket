"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getLaunchReadinessAreasList } from "@/lib/launch-readiness/mock-launch-readiness-areas";
import { LaunchAreaCard } from "./LaunchAreaCard";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";
import { getPhaseLabel } from "@/lib/launch-readiness/launch-readiness-utils";

export function LaunchAreaBoard() {
  const { t } = useI18n();
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
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={`rounded border px-3 py-1.5 sam-text-body-secondary ${
              phase === p
                ? "border-signature bg-signature/10 text-signature"
                : "border-sam-border bg-sam-surface text-sam-muted hover:bg-sam-app"
            }`}
          >
            {getPhaseLabel(p)}
          </button>
        ))}
      </div>

      {areas.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          영역별 데이터가 없습니다.
        </div>
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
