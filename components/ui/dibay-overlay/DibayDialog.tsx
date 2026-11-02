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
  /**
   * 고정 하단 영역에 직접 넣는 버튼·링크 (본문 스크롤 밖) — `actions` 로 표현할 수 없을 때만
   * (예: `<Link>` CTA). 버튼은 `DibayOverlayButton` / `OverlayUi.btn.*` 를 쓴다 (팝업 SSOT T2).
   */
  footer?: ReactNode;
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
  footer,
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
      <div
        className={OverlayUi.dialogPanel}
        data-dibay-dialog-panel="1"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={OverlayUi.dialogScroll} data-dibay-dialog-scroll="1">
          <h2 id={titleId} className={OverlayUi.title}>
            {title}
          </h2>
          {description != null ? (
            <p id={bodyId} className={OverlayUi.body}>
              {description}
            </p>
          ) : null}
          {children}
        </div>
        {actions && actions.length > 0 ? (
          <DibayOverlayActions layout={actionsLayout} actions={actions} />
        ) : null}
        {footer != null ? <div className="dibay-overlay-dialog__footer">{footer}</div> : null}
      </div>
    </DibayOverlayRoot>
  );
}
