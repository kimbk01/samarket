"use client";

import type { ReactNode } from "react";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayOverlayRoot, useOverlayTitleIds } from "./DibayOverlayRoot";
import { DibayOverlayActions, type DibayOverlayAction } from "./DibayOverlayActions";

export type DibayDialogProps = {
  open: boolean;
  onClose?: () => void;
  dismissible?: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: DibayOverlayAction[];
  actionsLayout?: "row" | "stack";
  zIndexClass?: string;
  ariaLabel?: string;
};

/** Center dialog surface — title / body / optional actions. */
export function DibayDialog({
  open,
  onClose,
  dismissible = true,
  title,
  description,
  children,
  actions,
  actionsLayout = "row",
  zIndexClass,
  ariaLabel,
}: DibayDialogProps) {
  const { titleId, bodyId } = useOverlayTitleIds("dialog");

  return (
    <DibayOverlayRoot
      open={open}
      onClose={onClose}
      dismissible={dismissible}
      placement="center"
      zRole="dialog"
      zIndexClass={zIndexClass}
      labelledBy={titleId}
      describedBy={description ? bodyId : undefined}
      ariaLabel={ariaLabel}
    >
      <div className={OverlayUi.dialogPanel} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className={OverlayUi.title}>
          {title}
        </h2>
        {description != null ? (
          <p id={bodyId} className={OverlayUi.body}>
            {description}
          </p>
        ) : null}
        {children}
        {actions && actions.length > 0 ? (
          <DibayOverlayActions layout={actionsLayout} actions={actions} />
        ) : null}
      </div>
    </DibayOverlayRoot>
  );
}
