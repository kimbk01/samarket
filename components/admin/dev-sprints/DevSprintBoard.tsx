"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getDevSprints } from "@/lib/dev-sprints/mock-dev-sprints";
import { getDevSprintItems } from "@/lib/dev-sprints/mock-dev-sprint-items";
import { getDevSprintById } from "@/lib/dev-sprints/mock-dev-sprints";
import { DevSprintItemCard } from "./DevSprintItemCard";
import { getSprintItemStatusLabel } from "@/lib/dev-sprints/dev-sprint-utils";
import type { DevSprintItemStatus } from "@/lib/types/dev-sprints";

const ITEM_STATUS_COLUMNS: DevSprintItemStatus[] = [
  "todo",
  "in_progress",
  "review",
  "qa_ready",
  "done",
  "blocked",
];

export function DevSprintBoard() {
  const { t } = useI18n();
  const [sprintId, setSprintId] = useState<string>("");

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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_dev_sprint_label_sprint")}</span>
        <select
          value={selectedSprintId}
          onChange={(e) => setSprintId(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_dev_sprint_select_sprint")}</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sprintName} ({s.status})
            </option>
          ))}
        </select>
        {selectedSprint && (
          <span className="sam-text-body-secondary text-sam-muted">
            {selectedSprint.sprintGoal}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_dev_sprint_empty_board")}
        </div>
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
