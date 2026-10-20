"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { FeedSectionOverrideKey } from "@/lib/types/feed-emergency";
import {
  getFeedSectionOverrides,
  SECTION_OVERRIDE_KEYS,
  SECTION_OVERRIDE_LABELS,
} from "@/lib/feed-emergency/feed-emergency-state";
import { setSectionForcedDisabled } from "@/lib/feed-emergency/feed-emergency-utils";
import { commitFeedEmergencyChange } from "@/lib/feed-emergency/feed-emergency-sync-client";
import { feedEmergencySwitchConfirmCopy } from "@/lib/feed-emergency/feed-emergency-switch-confirm";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

export function FeedSectionOverrideTable() {
  const [refresh, setRefresh] = useState(0);
  const [surface, setSurface] = useState<RecommendationSurface>("home");
  // 쓰기 = 접근표 action(최고관리자). 서버 가드는 그대로 — 화면에서 미리 막고 사유를 보여 준다.
  const writeAction = useAdminRouteAction("/admin/feed-emergency");
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  const overrides = useMemo(
    () => getFeedSectionOverrides(surface),
    [surface, refresh]
  );

  const handleToggle = async (
    sectionKey: FeedSectionOverrideKey,
    isForcedDisabled: boolean
  ) => {
    // 섹션 강제 비활성·해제 = emergencyBlock (L3: 사유 + 목표 상태 단어 재입력). 사유는 저장 API → 감사 기록.
    const copy = feedEmergencySwitchConfirmCopy({
      kind: "section",
      enable: isForcedDisabled,
      targetLabel: `${SURFACE_LABELS[surface]} · ${SECTION_OVERRIDE_LABELS[sectionKey]}`,
    });
    const c = await confirmAdminAction({
      level: adminActionLevel("emergencyBlock"),
      ko: true,
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirmLabel,
      destructive: true,
      retypeValue: copy.confirmMatchText,
    });
    if (!c.ok) return;
    // 저장 실패면 화면 상태를 되돌리고 실패를 알린다 (앱 반영 안 됨).
    const r = await commitFeedEmergencyChange(() =>
      setSectionForcedDisabled(
        surface,
        sectionKey,
        isForcedDisabled,
        isForcedDisabled ? "긴급 비활성화" : "긴급 해제"
      ),
      { reason: c.reason }
    );
    setResult(r.ok ? { ok: true, message: "저장했습니다. 앱 피드에 반영됩니다." } : { ok: false, code: r.error ?? "save_failed" });
    setRefresh((x) => x + 1);
  };

  const overrideMap = new Map(
    overrides.map((o) => [o.sectionKey, o])
  );

  return (
    <div className="space-y-4">
      <AdminResultBanner ko result={result} onClose={() => setResult(null)} />
      {writeAction.reason ? (
        <p className="sam-text-body-secondary text-sam-muted" data-admin-action-denied="1">
          변경 불가: {writeAction.reason}
        </p>
      ) : null}
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
                          ? "bg-sam-warning-soft text-sam-warning"
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
                    <AdminActionButton
                      size="sm"
                      variant={disabled ? "secondary" : "danger"}
                      disabled={!writeAction.allowed}
                      onClick={() => void handleToggle(sectionKey, !disabled)}
                    >
                      {disabled ? "차단 해제" : "긴급 차단"}
                    </AdminActionButton>
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
