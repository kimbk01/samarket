"use client";

import { Sam } from "@/lib/ui/sam-component-classes";

type Props = {
  message: string;
  onDismiss: () => void;
};

export function PermissionSuccessToast({ message, onDismiss }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[129] flex justify-center px-4">
      <div
        className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 shadow-lg ${Sam.text.body} text-sam-fg`}
        role="status"
      >
        <span aria-hidden>✅</span>
        <span className="flex-1">{message}</span>
        <button type="button" className={`${Sam.btn.ghostCombo} min-h-[36px] px-2`} onClick={onDismiss}>
          OK
        </button>
      </div>
    </div>
  );
}
