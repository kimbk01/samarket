"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getDevSprints,
  getDevSprintItems,
  getDevSprintById,
} from "@/lib/dev-sprints/dev-sprints-state";
import { DevSprintItemCard } from "./DevSprintItemCard";
import { getSprintItemStatusLabel } from "@/lib/dev-sprints/dev-sprint-utils";
import type { DevSprintItemStatus } from "@/lib/types/dev-sprints";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const ITEM_STATUS_COLUMNS: DevSprintItemStatus[] = [
  "todo",
  "in_progress",
  "review",
  "qa_ready",
  "done",
  "blocked",
];

const BOARD_EXTRAS = ["sprint"] as const;

export function DevSprintBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 스프린트 선택은 주소(`?sprint=`)에 보존 (R7). 비우면 진행·예정 첫 스프린트. */
  const lq = useAdminListQuery({ extras: BOARD_EXTRAS });
  const sprintId = lq.query.extras.sprint;

  const sprints = useMemo(() => getDevSprints(), []);
  const activeOrPlanned = useMemo(
    () => sprints.filter((s) => s.status === "active" || s.status === "planned"),
    [sprints]
  );
  const selectedSprintId = sprintId || activeOrPlanned[0]?.id || "";

  const items = useMemo(
    () => (selectedSprintId ? getDevSprintItems({ sprintId: selectedSprintId }) : []),
    [selectedSprintId]
  );

  const byStatus = useMemo(() => {
    const map: Record<DevSprintItemStatus, typeof items> = {
      todo: [],
      in_progress: [],
      review: [],
      qa_ready: [],
      done: [],
      blocked: [],
    };
    items.forEach((i) => {
      map[i.status].push(i);
    });
    return map;
  }, [items]);

  const selectedSprint = selectedSprintId ? getDevSprintById(selectedSprintId) : null;

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
          label={t("admin_dev_sprint_label_sprint")}
          name="sprint"
          value={sprintId}
          onChange={(v) => lq.setExtra("sprint", v)}
          allLabel={t("admin_dev_sprint_select_sprint")}
          options={sprints.map((s) => ({ value: s.id, label: s.sprintName }))}
        />
      </AdminFilterBar>
      {selectedSprint && (
        <p className="sam-text-body-secondary text-sam-muted">{selectedSprint.sprintGoal}</p>
      )}

      {items.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_dev_sprint_empty_board")} />
      ) : (
        <div className="grid gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {ITEM_STATUS_COLUMNS.map((status) => (
            <div
              key={status}
              className="min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-app/50 p-3"
            >
              <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
                {getSprintItemStatusLabel(t, status)}
                <span className="ml-1 text-sam-muted">
                  ({(byStatus[status] ?? []).length})
                </span>
              </h3>
              <div className="space-y-2">
                {(byStatus[status] ?? []).map((item) => (
                  <DevSprintItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
