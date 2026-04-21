"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { FeedSectionOverrideKey } from "@/lib/types/feed-emergency";
import {
  getFeedSectionOverrides,
  SECTION_OVERRIDE_KEYS,
  SECTION_OVERRIDE_LABELS,
} from "@/lib/feed-emergency/mock-feed-section-overrides";
import { setSectionForcedDisabled } from "@/lib/feed-emergency/feed-emergency-utils";
import { persistFeedEmergencyToServer } from "@/lib/feed-emergency/feed-emergency-sync-client";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

export function FeedSectionOverrideTable() {
  const [refresh, setRefresh] = useState(0);
  const [surface, setSurface] = useState<RecommendationSurface>("home");

  const overrides = useMemo(
    () => getFeedSectionOverrides(surface),
    [surface, refresh]
  );

  const handleToggle = async (
    sectionKey: FeedSectionOverrideKey,
    isForcedDisabled: boolean
  ) => {
    setSectionForcedDisabled(
      surface,
      sectionKey,
      isForcedDisabled,
      isForcedDisabled ? "긴급 비활성화" : "긴급 해제"
    );
    const r = await persistFeedEmergencyToServer();
    if (!r.ok) console.warn("[feed-emergency] 저장 실패:", r.error);
    setRefresh((x) => x + 1);
  };

  const overrideMap = new Map(
    overrides.map((o) => [o.sectionKey, o])
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">surface</label>
        <select
          value={surface}
          onChange={(e) =>
            setSurface(e.target.value as RecommendationSurface)
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {SURFACE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[480px] border-collapse sam-text-body">
          <thead>
            <tr className="border-b border-sam-border bg-sam-app">
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                섹션
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                강제 비활성
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                사유
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                조치
              </th>
            </tr>
          </thead>
          <tbody>
            {SECTION_OVERRIDE_KEYS.map((sectionKey) => {
              const ov = overrideMap.get(sectionKey);
              const disabled = ov?.isForcedDisabled ?? false;
              return (
                <tr
                  key={sectionKey}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {SECTION_OVERRIDE_LABELS[sectionKey]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                        disabled
                          ? "bg-amber-50 text-amber-800"
                          : "bg-sam-surface-muted text-sam-muted"
                      }`}
                    >
                      {disabled ? "비활성" : "정상"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                    {ov?.reason ?? "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => void handleToggle(sectionKey, !disabled)}
                      className={`rounded border px-2 py-1 sam-text-body-secondary ${
                        disabled
                          ? "border-sam-border bg-sam-app text-sam-fg"
                          : "border-amber-200 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {disabled ? "해제" : "비활성화"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {overrides.length === 0 && (
        <p className="sam-text-body-secondary text-sam-muted">
          현재 비활성 오버라이드가 없습니다. 위에서 섹션별 비활성화를 적용할 수 있습니다.
        </p>
      )}
    </div>
  );
}
