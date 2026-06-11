"use client";

import { useEffect, type ReactNode } from "react";
import { ADMIN_USERS_CARD_CLASS } from "@/lib/ui/admin-users-starbucks-styles";

interface AdminFormSheetProps {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidthClass?: string;
}

export function AdminFormSheet({
  title,
  subtitle,
  children,
  footer,
  onClose,
  maxWidthClass = "max-w-2xl",
}: AdminFormSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`${ADMIN_USERS_CARD_CLASS} max-h-[92vh] w-full ${maxWidthClass} overflow-hidden shadow-sam-elevated sm:rounded-ui-rect`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sticky top-0 z-10 border-b border-[#D4E9E2]/80 bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-[#1E3932]">{title}</h2>
          {subtitle ? <p className="mt-1 text-[13px] text-[#6F4E37]">{subtitle}</p> : null}
        </div>
        <div className="max-h-[calc(92vh-8rem)] overflow-y-auto p-5">{children}</div>
        {footer ? <div className="border-t border-[#D4E9E2]/80 bg-[#F2F0EB]/50 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
