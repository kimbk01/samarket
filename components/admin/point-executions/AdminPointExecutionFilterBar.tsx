"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointExecStatusLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";
import type { PointRewardExecutionStatus } from "@/lib/point-executions/point-execution-utils";
import { BOARD_OPTIONS } from "@/lib/point-policies/point-policy-utils";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import type { UseAdminListQueryResult } from "@/lib/admin/list-query/use-admin-list-query";

export const POINT_EXECUTION_STATUSES: PointRewardExecutionStatus[] = ["success", "blocked", "reversed"];
export const POINT_EXECUTION_FILTER_EXTRAS = ["boardKey", "actionType", "userId"] as const;
export type PointExecutionFilterExtra = (typeof POINT_EXECUTION_FILTER_EXTRAS)[number];

const FIELD =
  "h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[16px] text-sam-fg";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-sam-muted";

/**
 * 실행 이력 필터 — 상태·게시판·행동은 바꾸는 즉시, 회원 ID 는 「조회」/Enter 로 적용 (주소 동기화).
 */
export function AdminPointExecutionFilterBar({
  lq,
  pending,
}: {
  lq: UseAdminListQueryResult<PointExecutionFilterExtra>;
  pending?: boolean;
}) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const applied = lq.query.extras.userId ?? "";
  const [draft, setDraft] = useState<{ key: string; value: string }>({ key: applied, value: applied });
  let userIdDraft = draft.value;
  if (draft.key !== applied) {
    userIdDraft = applied;
    setDraft({ key: applied, value: applied });
  }

  return (
    <AdminFilterBar
      ko={ko}
      draft={lq.draft}
      onDraftChange={lq.setDraft}
      onSubmit={() => lq.patch({ extras: { userId: userIdDraft.trim() } })}
      onReset={lq.reset}
      showPeriod={false}
      showSearch={false}
      pending={pending}
      status={{
        value: lq.query.status,
        onChange: lq.setStatus,
        options: POINT_EXECUTION_STATUSES.map((s) => ({ value: s, label: pointExecStatusLabel(t, s) })),
      }}
    >
      <label className={LABEL}>
        {t("admin_points_th_board")}
        <select
          value={lq.query.extras.boardKey ?? ""}
          onChange={(e) => lq.setExtra("boardKey", e.target.value)}
          className={FIELD}
        >
          <option value="">{t("admin_points_filter_all_boards")}</option>
          {BOARD_OPTIONS.map((b) => (
            <option key={b.key} value={b.key}>
              {pointBoardLabel(t, b.key)}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        {t("admin_points_th_action")}
        <select
          value={lq.query.extras.actionType ?? ""}
          onChange={(e) => lq.setExtra("actionType", e.target.value)}
          className={FIELD}
        >
          <option value="">{t("admin_points_filter_all_actions")}</option>
          <option value="write">{pointActionTypeLabel(t, "write")}</option>
          <option value="comment">{pointActionTypeLabel(t, "comment")}</option>
        </select>
      </label>
      <label className={LABEL}>
        {t("admin_points_ph_user_id")}
        <input
          type="text"
          value={userIdDraft}
          placeholder={t("admin_points_ph_user_id")}
          onChange={(e) => setDraft({ key: applied, value: e.target.value })}
          className={`${FIELD} min-w-[10rem]`}
          name="userId"
        />
      </label>
    </AdminFilterBar>
  );
}
