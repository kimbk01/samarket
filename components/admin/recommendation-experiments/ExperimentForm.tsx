"use client";

import { useState } from "react";
import type {
  RecommendationExperiment,
  RecommendationSurface,
  TrafficAllocationType,
} from "@/lib/types/recommendation-experiment";
import {
  EXPERIMENT_STATUS_LABELS,
  TRAFFIC_ALLOCATION_LABELS,
} from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import { getFeedVersions } from "@/lib/recommendation-experiments/mock-feed-versions";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

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

export function ExperimentForm({
  initial,
  onSubmit,
  onCancel,
}: ExperimentFormProps) {
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
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          실험명
        </label>
        <input
          type="text"
          value={experimentName}
          onChange={(e) => setExperimentName(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          설명
        </label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          상태
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as RecommendationExperiment["status"])}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        >
          {(Object.keys(EXPERIMENT_STATUS_LABELS) as RecommendationExperiment["status"][]).map(
            (s) => (
              <option key={s} value={s}>
                {EXPERIMENT_STATUS_LABELS[s]}
              </option>
            )
          )}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          대상 surface
        </label>
        <select
          value={targetSurface}
          onChange={(e) => setTargetSurface(e.target.value as RecommendationSurface)}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {SURFACE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          대조군 버전
        </label>
        <select
          value={controlVersionId}
          onChange={(e) => setControlVersionId(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.versionName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          트래픽 할당
        </label>
        <select
          value={trafficAllocationType}
          onChange={(e) =>
            setTrafficAllocationType(e.target.value as TrafficAllocationType)
          }
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        >
          {TRAFFIC_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRAFFIC_ALLOCATION_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-[12px] text-sam-muted">
            대조군 %
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={controlPercentage}
            onChange={(e) =>
              setControlPercentage(Number(e.target.value) || 0)
            }
            className="w-full rounded border border-sam-border px-2 py-1.5 text-[14px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-sam-muted">
            실험군 % (쉼표)
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
            className="w-full rounded border border-sam-border px-2 py-1.5 text-[14px]"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[14px] font-medium text-sam-fg">
          관리자 메모
        </label>
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white"
        >
          저장
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 text-[14px] text-sam-fg"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
