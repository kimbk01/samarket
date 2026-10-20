"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { useRef, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
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
  /** 링크 URL 입력 폼 (null = 닫힘) */
  const [linkDraft, setLinkDraft] = useState<string | null>(null);

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
    setLinkDraft("https://");
  };

  const insertLink = () => {
    if (linkDraft == null) return;
    const url = linkDraft;
    setLinkDraft(null);
    apply("link", { url });
  };

  const onImageFile = async (file: File | null) => {
    if (!file) return;
    onUploadingChange?.(true);
    try {
      const url = await uploadBodyImage(file);
      if (!url) {
        await dibayAlert({ title: safeT("admin_cc_upload_failed", {
            fallbackKo: "이미지 업로드에 실패했습니다",
            fallbackEn: "Image upload failed",
          }) });
        return;
      }
      apply("image", { url, alt: file.name.replace(/\.[^.]+$/, "") || "이미지" });
    } finally {
      onUploadingChange?.(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-ui-rect border border-b-0 border-sam-border bg-sam-muted/10 px-2 py-1.5">
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => apply("h2")}>
        {safeT("admin_cc_md_h2", { fallbackKo: "소제목", fallbackEn: "Subheading" })}
      </AdminActionButton>
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => apply("h3")}>
        {safeT("admin_cc_md_h3", { fallbackKo: "작은 제목", fallbackEn: "Small heading" })}
      </AdminActionButton>
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => apply("bold")}>
        B
      </AdminActionButton>
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => apply("italic")}>
        I
      </AdminActionButton>
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => apply("ul")}>
        {safeT("admin_cc_md_ul", { fallbackKo: "목록", fallbackEn: "List" })}
      </AdminActionButton>
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => apply("ol")}>
        {safeT("admin_cc_md_ol", { fallbackKo: "번호", fallbackEn: "Numbered" })}
      </AdminActionButton>
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => apply("quote")}>
        {safeT("admin_cc_md_quote", { fallbackKo: "인용", fallbackEn: "Quote" })}
      </AdminActionButton>
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={onLink}>
        {safeT("admin_cc_md_link", { fallbackKo: "링크", fallbackEn: "Link" })}
      </AdminActionButton>
      <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => fileRef.current?.click()}>
        {safeT("admin_cc_md_image", { fallbackKo: "이미지", fallbackEn: "Image" })}
      </AdminActionButton>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void onImageFile(e.target.files?.[0] ?? null)}
      />
      {linkDraft != null ? (
        <div className="flex w-full flex-wrap items-center gap-1" data-admin-cc-md-link-form="1">
          <input
            type="text"
            autoFocus
            value={linkDraft}
            aria-label={safeT("admin_cc_md_link_prompt", {
              fallbackKo: "링크 URL (https://… 또는 /경로)",
              fallbackEn: "Link URL (https://… or /path)",
            })}
            placeholder={safeT("admin_cc_md_link_prompt", {
              fallbackKo: "링크 URL (https://… 또는 /경로)",
              fallbackEn: "Link URL (https://… or /path)",
            })}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertLink();
              } else if (e.key === "Escape") {
                setLinkDraft(null);
              }
            }}
            className="min-w-0 flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 text-[13px] text-sam-fg"
          />
          <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={insertLink}>
            {safeT("admin_cc_md_link", { fallbackKo: "링크", fallbackEn: "Link" })}
          </AdminActionButton>
          <AdminActionButton variant="quiet" size="sm" onClick={() => setLinkDraft(null)}>
            {safeT("common_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
          </AdminActionButton>
        </div>
      ) : null}
    </div>
  );
}
