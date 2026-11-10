"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 연락처 하위 화면 머리글 — 메신저 공통 머리글 규칙(52px · 제목 17/600) */
export function MessengerContactsSubHeader({ title, sub, trailing }: { title: string; sub?: string | null; trailing?: ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <header
      className="sticky top-0 z-10 flex h-[52px] shrink-0 items-center gap-1 border-b border-[color:var(--messenger-divider)] bg-[color:var(--cm-chat-bg,#fff)] px-1.5"
      data-cm-contacts-header=""
    >
      <button
        type="button"
        aria-label={t("cm_contacts_cancel")}
        onClick={() => router.back()}
        className="flex h-11 w-11 items-center justify-center rounded-full active:bg-[color:var(--cm-chat-band)]"
      >
        <ChevronLeft className="h-6 w-6" style={{ color: "var(--cm-chat-fg)" }} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-semibold leading-tight" style={{ color: "var(--cm-chat-fg)" }}>
          {title}
        </h1>
        {sub ? (
          <p className="truncate text-[11.5px]" style={{ color: "var(--cm-chat-sub)" }}>
            {sub}
          </p>
        ) : null}
      </div>
      {trailing}
    </header>
  );
}
