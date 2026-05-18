"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 댓글 입력 — CommunityDetail 내부 폼과 동일 동작이 필요하면 상위에서 위임 */
export function CommunityCommentForm({
  placeholder,
  disabled,
  onSubmit,
}: {
  placeholder?: string;
  disabled?: boolean;
  onSubmit?: (text: string) => void;
}) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t("community_comment_placeholder");

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const text = String(fd.get("c") ?? "").trim();
        if (text) {
          onSubmit?.(text);
          form.reset();
        }
      }}
    >
      <input
        name="c"
        disabled={disabled}
        placeholder={resolvedPlaceholder}
        className="min-w-0 flex-1 rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
      />
      <button
        type="submit"
        disabled={disabled}
        className="rounded-ui-rect bg-sam-ink px-3 py-2 sam-text-body-secondary font-medium text-white disabled:opacity-50"
      >
        {t("community_comment_submit")}
      </button>
    </form>
  );
}
