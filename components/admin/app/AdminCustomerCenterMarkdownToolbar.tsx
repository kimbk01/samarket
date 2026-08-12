"use client";

import { useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  insertCustomerCenterMarkdown,
  type MarkdownWrapKind,
} from "@/lib/notices/customer-center-safe-markdown";

type Props = {
  value: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onChange: (next: string) => void;
  onUploadingChange?: (busy: boolean) => void;
  disabled?: boolean;
};

async function uploadBodyImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.set("kind", "body");
  fd.set("file", file);
  const res = await fetch("/api/admin/app-notices/upload-image", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string };
  return res.ok && j.ok && j.url ? j.url : null;
}

export function AdminCustomerCenterMarkdownToolbar({
  value,
  textareaRef,
  onChange,
  onUploadingChange,
  disabled,
}: Props) {
  const { safeT } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (kind: MarkdownWrapKind, extras?: { url?: string; alt?: string }) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const result = insertCustomerCenterMarkdown(value, start, end, kind, extras);
    onChange(result.next);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  const onLink = () => {
    const raw = window.prompt(
      safeT("admin_cc_md_link_prompt", {
        fallbackKo: "링크 URL (https://… 또는 /경로)",
        fallbackEn: "Link URL (https://… or /path)",
      }),
      "https://"
    );
    if (raw == null) return;
    apply("link", { url: raw });
  };

  const onImageFile = async (file: File | null) => {
    if (!file) return;
    onUploadingChange?.(true);
    try {
      const url = await uploadBodyImage(file);
      if (!url) {
        window.alert(
          safeT("admin_cc_upload_failed", {
            fallbackKo: "이미지 업로드에 실패했습니다",
            fallbackEn: "Image upload failed",
          })
        );
        return;
      }
      apply("image", { url, alt: file.name.replace(/\.[^.]+$/, "") || "이미지" });
    } finally {
      onUploadingChange?.(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const btn =
    "rounded border border-sam-border bg-sam-app px-2 py-1 text-xs font-medium text-sam-fg disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-ui-rect border border-b-0 border-sam-border bg-sam-muted/10 px-2 py-1.5">
      <button type="button" className={btn} disabled={disabled} onClick={() => apply("h2")}>
        {safeT("admin_cc_md_h2", { fallbackKo: "소제목", fallbackEn: "Subheading" })}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => apply("h3")}>
        {safeT("admin_cc_md_h3", { fallbackKo: "작은 제목", fallbackEn: "Small heading" })}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => apply("bold")}>
        B
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => apply("italic")}>
        I
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => apply("ul")}>
        {safeT("admin_cc_md_ul", { fallbackKo: "목록", fallbackEn: "List" })}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => apply("ol")}>
        {safeT("admin_cc_md_ol", { fallbackKo: "번호", fallbackEn: "Numbered" })}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => apply("quote")}>
        {safeT("admin_cc_md_quote", { fallbackKo: "인용", fallbackEn: "Quote" })}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={onLink}>
        {safeT("admin_cc_md_link", { fallbackKo: "링크", fallbackEn: "Link" })}
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => fileRef.current?.click()}>
        {safeT("admin_cc_md_image", { fallbackKo: "이미지", fallbackEn: "Image" })}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onImageFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
