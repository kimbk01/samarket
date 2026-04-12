"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { OpsDocType, OpsDocCategory } from "@/lib/types/ops-docs";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";
import { addOpsDocument, updateOpsDocument } from "@/lib/ops-docs/mock-ops-documents";
import { addOpsDocumentLog } from "@/lib/ops-docs/mock-ops-document-logs";
import { slugFromTitle } from "@/lib/ops-docs/ops-docs-utils";

const DOC_TYPE_OPTIONS: { value: OpsDocType; label: string }[] = [
  { value: "sop", label: "SOP" },
  { value: "playbook", label: "플레이북" },
  { value: "scenario", label: "시나리오" },
];

const CATEGORY_OPTIONS: { value: OpsDocCategory; label: string }[] = [
  { value: "incident_response", label: "인시던트 대응" },
  { value: "deployment", label: "배포" },
  { value: "rollback", label: "롤백" },
  { value: "moderation", label: "검수" },
  { value: "recommendation", label: "추천" },
  { value: "ads", label: "광고" },
  { value: "points", label: "포인트" },
  { value: "support", label: "지원" },
];

interface OpsDocumentFormProps {
  documentId?: string | null;
}

export function OpsDocumentForm({ documentId }: OpsDocumentFormProps) {
  const router = useRouter();
  const isEdit = !!documentId;

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [docType, setDocType] = useState<OpsDocType>("playbook");
  const [category, setCategory] = useState<OpsDocCategory>("recommendation");
  const [status, setStatus] = useState<"draft" | "active">("draft");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [versionLabel, setVersionLabel] = useState("1.0");
  const [isPinned, setIsPinned] = useState(false);
  const [adminMemo, setAdminMemo] = useState("");

  useEffect(() => {
    if (documentId) {
      const doc = getOpsDocumentById(documentId);
      if (doc) {
        setTitle(doc.title);
        setSlug(doc.slug);
        setDocType(doc.docType);
        setCategory(doc.category);
        setStatus(doc.status === "archived" ? "draft" : doc.status);
        setSummary(doc.summary);
        setContent(doc.content);
        setTagsStr(doc.tags.join(", "));
        setVersionLabel(doc.versionLabel);
        setIsPinned(doc.isPinned);
        setAdminMemo(doc.adminMemo);
      }
    }
  }, [documentId]);

  const handleTitleBlur = () => {
    if (!isEdit && !slug) setSlug(slugFromTitle(title));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const adminId = "admin1";
    const adminNickname = "관리자";

    if (isEdit && documentId) {
      updateOpsDocument(documentId, {
        title,
        slug,
        category,
        status,
        summary,
        content,
        tags,
        versionLabel,
        isPinned,
        adminMemo,
      });
      addOpsDocumentLog({
        documentId,
        actionType: "update",
        actorType: "admin",
        actorId: adminId,
        actorNickname: adminNickname,
        note: "수정 저장",
        createdAt: new Date().toISOString(),
      });
      router.push(`/admin/ops-docs/${documentId}`);
    } else {
      const doc = addOpsDocument({
        docType,
        title,
        slug: slug || slugFromTitle(title),
        category,
        status,
        summary,
        content,
        tags,
        versionLabel,
        isPinned,
        createdByAdminId: adminId,
        createdByAdminNickname: adminNickname,
        approvedByAdminId: null,
        approvedByAdminNickname: null,
        adminMemo,
      });
      addOpsDocumentLog({
        documentId: doc.id,
        actionType: "create",
        actorType: "admin",
        actorId: adminId,
        actorNickname: adminNickname,
        note: "",
        createdAt: doc.createdAt,
      });
      router.push(`/admin/ops-docs/${doc.id}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-sam-fg">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            required
            className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-sam-fg">slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-sam-fg">유형</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as OpsDocType)}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-sam-fg">카테고리</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as OpsDocCategory)}
            className="rounded border border-sam-border px-3 py-2 text-[14px]"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {!isEdit && (
          <div>
            <label className="mb-1 block text-[12px] font-medium text-sam-fg">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "active")}
              className="rounded border border-sam-border px-3 py-2 text-[14px]"
            >
              <option value="draft">초안</option>
              <option value="active">활성</option>
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-[12px] font-medium text-sam-fg">버전</label>
          <input
            type="text"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            className="w-20 rounded border border-sam-border px-3 py-2 text-[14px]"
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-[14px] text-sam-fg">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
            />
            고정
          </label>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-sam-fg">요약</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-sam-fg">본문</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px] font-mono"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-sam-fg">태그 (쉼표 구분)</label>
        <input
          type="text"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          placeholder="feed, fallback, recommendation"
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        />
      </div>
      <div>
        <label className="mb-1 block text-[12px] font-medium text-sam-fg">관리자 메모</label>
        <input
          type="text"
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 text-[14px]"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white"
        >
          {isEdit ? "저장" : "생성"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded border border-sam-border bg-sam-surface px-4 py-2 text-[14px] text-sam-fg"
        >
          취소
        </button>
      </div>
    </form>
  );
}
