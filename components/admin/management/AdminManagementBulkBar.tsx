"use client";

import type { ReactNode } from "react";
import { ConsoleButton } from "@/components/admin/trade-console/trade-console-ui";
import { managementCtaConsoleVariant } from "@/lib/admin/management/cta-taxonomy";
import type { BulkActionId } from "@/lib/admin/management/types";
import {
  isBulkActionAllowed,
  type EntityActionPolicy,
} from "@/lib/admin/management/entity-action-policy";

export type BulkBarAction = {
  id: BulkActionId;
  label: string;
  onClick: () => void;
};

/**
 * Shows only policy-allowed bulk actions. Hidden when selectedCount === 0.
 */
export function AdminManagementBulkBar(props: {
  selectedCount: number;
  policy: EntityActionPolicy;
  actions: BulkBarAction[];
  selectedLabel: string;
  /** Shown when policy allows no bulk mutations (e.g. members). */
  emptyActionsHint?: string;
}) {
  const { selectedCount, policy, actions, selectedLabel, emptyActionsHint } = props;
  if (selectedCount <= 0) return null;

  const visible = actions.filter((a) => isBulkActionAllowed(policy, a.id));

  return (
    <div
      data-admin-mgmt-bulk-bar="1"
      className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-sam-border bg-sam-surface px-3 py-2"
    >
      <span className="sam-text-body-secondary font-medium">{selectedLabel}</span>
      {visible.length === 0 && emptyActionsHint ? (
        <span className="sam-text-xxs text-sam-muted" data-admin-mgmt-bulk-empty="1">
          {emptyActionsHint}
        </span>
      ) : null}
      {visible.map((a) => {
        const isHard = a.id === "hard_delete";
        const isSoftDestructive = a.id === "soft_delete" || a.id === "cancel";
        const variant =
          isHard || isSoftDestructive
            ? managementCtaConsoleVariant("DANGER")
            : managementCtaConsoleVariant("STATUS");
        return (
          <ConsoleButton
            key={a.id}
            variant={variant}
            size="sm"
            onClick={a.onClick}
            data-admin-mgmt-bulk-action={a.id}
            data-admin-mgmt-hard-delete={isHard ? "1" : undefined}
            className={isHard ? "ring-1 ring-red-700/40" : undefined}
          >
            {a.label}
          </ConsoleButton>
        );
      })}
    </div>
  );
}

export function AdminManagementCta(props: {
  variant: "PRIMARY" | "SECONDARY" | "TERTIARY" | "STATUS" | "DANGER";
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <ConsoleButton
      variant={managementCtaConsoleVariant(props.variant)}
      size="sm"
      onClick={props.onClick}
      disabled={props.disabled}
      type={props.type}
      className={props.className}
    >
      {props.children}
    </ConsoleButton>
  );
}
