"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type {
  RecommendationExperiment,
  RecommendationSurface,
  TrafficAllocationType,
} from "@/lib/types/recommendation-experiment";
import { getFeedVersions } from "@/lib/recommendation-experiments/mock-feed-versions";
import {
  recExperimentStatusLabel,
  recSurfaceLabel,
  recTrafficAllocLabel,
} from "@/components/admin/recommendation-admin-i18n";

interface ExperimentFormProps {
  initial: RecommendationExperiment;
  onSubmit: (values: Partial<RecommendationExperiment>) => void;
  onCancel?: () => void;
}

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];
const TRAFFIC_TYPES: TrafficAllocationType[] = [
  "percentage",
  "region_based",
  "member_type_based",
];
const STATUSES: RecommendationExperiment["status"][] = [
  "draft",
  "running",
  "paused",
  "ended",
];

export function ExperimentForm({
  initial,
  onSubmit,
  onCancel,
}: ExperimentFormProps) {
  const { t } = useI18n();
  const [experimentName, setExperimentName] = useState(initial.experimentName);
  const [description, setDescription] = useState(initial.description);
  const [status, setStatus] = useState(initial.status);
  const [targetSurface, setTargetSurface] = useState(initial.targetSurface);
  const [controlVersionId, setControlVersionId] = useState(
    initial.controlVersionId
  );
  const [variantVersionIds, setVariantVersionIds] = useState<string[]>(
    initial.variantVersionIds
  );
  const [trafficAllocationType, setTrafficAllocationType] = useState(
    initial.trafficAllocationType
  );
  const [controlPercentage, setControlPercentage] = useState(
    initial.controlPercentage
  );
  const [variantPercentages, setVariantPercentages] = useState<number[]>(
    initial.variantPercentages
  );
  const [adminMemo, setAdminMemo] = useState(initial.adminMemo ?? "");

  const versions = getFeedVersions(targetSurface);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial.id,
      experimentName,
      description,
      status,
      targetSurface,
      controlVersionId,
      variantVersionIds: variantVersionIds.length ? variantVersionIds : initial.variantVersionIds,
      trafficAllocationType,
      controlPercentage,
      variantPercentages: variantPercentages.length ? variantPercentages : initial.variantPercentages,
      adminMemo: adminMemo || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_experiment_name")}
        </label>
        <input
          type="text"
          value={experimentName}
          onChange={(e) => setExperimentName(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_description")}
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_th_status")}
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as RecommendationExperiment["status"])}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {recExperimentStatusLabel(t, s)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_target_surface")}
        </label>
        <select
          value={targetSurface}
          onChange={(e) => setTargetSurface(e.target.value as RecommendationSurface)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {recSurfaceLabel(t, s)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_control_version")}
        </label>
        <select
          value={controlVersionId}
          onChange={(e) => setControlVersionId(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.versionName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_traffic")}
        </label>
        <select
          value={trafficAllocationType}
          onChange={(e) =>
            setTrafficAllocationType(e.target.value as TrafficAllocationType)
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {TRAFFIC_TYPES.map((tt) => (
            <option key={tt} value={tt}>
              {recTrafficAllocLabel(t, tt)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block sam-text-helper text-sam-muted">
            {t("admin_rec_exp_label_control_pct")}
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={controlPercentage}
            onChange={(e) =>
              setControlPercentage(Number(e.target.value) || 0)
            }
            className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
          />
        </div>
        <div>
          <label className="mb-1 block sam-text-helper text-sam-muted">
            {t("admin_rec_exp_label_variant_pct")}
          </label>
          <input
            type="text"
            placeholder="25, 25"
            value={variantPercentages.join(", ")}
            onChange={(e) =>
              setVariantPercentages(
                e.target.value
                  .split(",")
                  .map((n) => Number(n.trim()) || 0)
                  .filter(Boolean)
              )
            }
            className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_admin_memo")}
        </label>
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {t("common_save")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg"
          >
            {t("common_cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
