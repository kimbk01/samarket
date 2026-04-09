"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { FeedSectionOverrideKey } from "@/lib/types/feed-emergency";
import { getFeedSectionOverrides } from "@/lib/feed-emergency/mock-feed-section-overrides";
import {
  SECTION_OVERRIDE_KEYS,
  SECTION_OVERRIDE_LABELS,
  setFeedSectionOverride,
} from "@/lib/feed-emergency/mock-feed-section-overrides";
import { setSectionForcedDisabled } from "@/lib/feed-emergency/feed-emergency-utils";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

export function FeedSectionOverrideTable() {
  const [refresh, setRefresh] = useState(0);
  const [surface, setSurface] = useState<RecommendationSurface>("home");

  const overrides = useMemo(
    () => getFeedSectionOverrides(surface),
    [surface, refresh]
  );

  const handleToggle = (
    sectionKey: FeedSectionOverrideKey,
    isForcedDisabled: boolean
  ) => {
    setSectionForcedDisabled(
      surface,
      sectionKey,
      isForcedDisabled,
      isForcedDisabled ? "긴급 비활성화" : "긴급 해제"
    );
    setRefresh((r) => r + 1);
  };

  const overrideMap = new Map(
    overrides.map((o) => [o.sectionKey, o])
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[14px] font-medium text-gray-700">surface</label>
        <select
          value={surface}
          onChange={(e) =>
            setSurface(e.target.value as RecommendationSurface)
          }
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {SURFACE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
        <table className="w-full min-w-[480px] border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                섹션
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                강제 비활성
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                사유
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-700">
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
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900">
                    {SECTION_OVERRIDE_LABELS[sectionKey]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                        disabled
                          ? "bg-amber-50 text-amber-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {disabled ? "비활성" : "정상"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-gray-600">
                    {ov?.reason ?? "-"}
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggle(sectionKey, !disabled)}
                      className={`rounded border px-2 py-1 text-[13px] ${
                        disabled
                          ? "border-gray-200 bg-gray-50 text-gray-700"
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
        <p className="text-[13px] text-gray-500">
          현재 비활성 오버라이드가 없습니다. 위에서 섹션별 비활성화를 적용할 수 있습니다.
        </p>
      )}
    </div>
  );
}
