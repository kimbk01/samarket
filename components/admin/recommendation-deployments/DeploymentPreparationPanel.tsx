"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getFeedVersions } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getActiveFeedVersionBySurface } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getExperimentWinnerSummaries } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { deployVersion } from "@/lib/recommendation-deployments/recommendation-deployment-utils";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

export function DeploymentPreparationPanel() {
  const { t } = useI18n();
  const [surface, setSurface] = useState<RecommendationSurface>("home");
  const [versionId, setVersionId] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const versions = useMemo(
    () => getFeedVersions(surface),
    [surface, refresh]
  );
  const active = useMemo(
    () => getActiveFeedVersionBySurface(surface),
    [surface, refresh]
  );
  const winnerSummaries = useMemo(
    () => getExperimentWinnerSummaries().filter((s) => {
      const v = versions.find((x) => x.id === s.winningVersionId);
      return v?.surface === surface;
    }),
    [surface, versions]
  );

  const handleDeploy = () => {
    if (!versionId) return;
    setDeploying(true);
    deployVersion({
      surface,
      versionId,
      deploymentName: `배포: ${versions.find((v) => v.id === versionId)?.versionName ?? versionId}`,
      note: "관리자 배포",
    });
    setDeploying(false);
    setVersionId("");
    setRefresh((r) => r + 1);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
        <p className="sam-text-body font-medium text-sam-fg">{t("admin_rec_deploy_deploy_8")}</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {t("admin_rec_deployments_set_live_hint", { live: active?.liveVersionId ?? "-" })}
        </p>
      </div>
      {winnerSummaries.length > 0 && (
        <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft p-4">
          <p className="sam-text-body font-medium text-sam-warning">
            {t("admin_rec_deployments_winner_reco_heading")}
          </p>
          <ul className="mt-2 space-y-1 sam-text-body-secondary text-sam-warning">
            {winnerSummaries.slice(0, 3).map((s) => (
              <li key={s.experimentId}>
                {t("admin_rec_deployments_winner_line", { experiment: s.experimentId, version: s.winningVersionId, metric: s.winningMetric })}{" "}
                {s.autoDeployRecommended ? `· ${t("admin_rec_deploy_recommended")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">surface</label>
        <select
          value={surface}
          onChange={(e) => {
            setSurface(e.target.value as RecommendationSurface);
            setVersionId("");
          }}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {SURFACE_LABELS[s]}
            </option>
          ))}
        </select>
        <label className="sam-text-body font-medium text-sam-fg">{t("admin_rec_deploy_k593f8a81")}</label>
        <select
          value={versionId}
          onChange={(e) => setVersionId(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_misc_select_option")}</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.versionName}
            </option>
          ))}
        </select>
        <AdminActionButton
          variant="primary"
          type="button"
          onClick={handleDeploy}
          disabled={!versionId || deploying}
        >
          {t("admin_rec_deployments_run_deploy")}
        </AdminActionButton>
      </div>
      <p className="sam-text-helper text-sam-muted">
        {t("admin_rec_deployments_schedule_hint")}
      </p>
    </div>
  );
}
