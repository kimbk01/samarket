"use client";

import type { ReactNode } from "react";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { DibayBottomSheet } from "./DibayBottomSheet";
import { DibayOverlayButton } from "./DibayOverlayActions";

export type DibayActionSheetItem = {
  key: string;
  label: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
};

export type DibayActionSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  items: DibayActionSheetItem[];
  /** 목록 위 안내 한 줄(잠긴 항목의 이유 등) — `PostListMenuBottomSheet` 잠금 안내와 같은 경고 캡션 */
  notice?: ReactNode;
  cancelLabel: ReactNode;
};

/** Vertical action list + separated cancel — Action Sheet canonical. */
export function DibayActionSheet({
  open,
  onClose,
  title,
  items,
  notice,
  cancelLabel,
}: DibayActionSheetProps) {
  return (
    <DibayBottomSheet open={open} onClose={onClose} title={title}>
      {notice ? <p className={`mb-2 px-1 ${OverlayUi.captionWarning}`}>{notice}</p> : null}
      <div className={OverlayUi.actionSheetList}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            disabled={item.disabled}
            className={item.danger ? OverlayUi.actionSheetItemDanger : OverlayUi.actionSheetItem}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <DibayOverlayButton roleTone="secondary" onClick={onClose}>
          {cancelLabel}
        </DibayOverlayButton>
      </div>
    </DibayBottomSheet>
  );
}
