"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import {
  getCarryOverExecutions,
  getOpsRoutineTemplateById,
} from "@/lib/ops-routines/ops-routines-state";
import { getCadenceLabel, getPriorityLabel } from "@/lib/ops-routines/ops-routines-utils";
import Link from "next/link";

export function OpsCarryOverBoard() {
  const { t } = useI18n();
  const carryOver = useMemo(() => getCarryOverExecutions(), []);

  if (carryOver.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_routines_carry_empty")}</div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_routines_carry_hint")}</p>
      <div className="space-y-3">
        {carryOver.map((e) => {
          const template = getOpsRoutineTemplateById(e.templateId);
          return (
            <div
              key={e.id}
              className="rounded-ui-rect border border-amber-200 bg-amber-50/50 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
                <span>{getCadenceLabel(e.periodType as "weekly" | "monthly" | "quarterly")}</span>
                <span className="rounded bg-sam-surface-muted px-1.5 py-0.5">
                  {getPriorityLabel(e.priority)}
                </span>
                <span>{e.periodKey}</span>
              </div>
              <p className="mt-2 font-medium text-sam-fg">
                {template?.title ?? e.templateId}
              </p>
              {e.note && (
                <p className="mt-2 sam-text-body-secondary text-sam-fg">{e.note}</p>
              )}
              {(e.ownerAdminNickname || e.dueDate) && (
                <p className="mt-2 sam-text-helper text-sam-muted">
                  {t("admin_ops_tools_routines_carry_owner", {
                    name: e.ownerAdminNickname ?? "-",
                  })}
                  {e.dueDate && ` ${t("admin_ops_tools_routines_carry_due", { date: e.dueDate })}`}
                </p>
              )}
              {e.linkedType && (
                <p className="mt-1 sam-text-helper text-sam-muted">
                  {t("admin_ops_tools_routines_carry_link", { type: e.linkedType })}
                  {e.linkedType === "checklist" && (
                    <Link
                      href="/admin/ops-board"
                      className="ml-1 text-signature hover:underline"
                    >{t("admin_ops_tools_board_page_title")}</Link>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
