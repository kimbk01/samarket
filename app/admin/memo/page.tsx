"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  MANUAL_DURING_TEST,
  BEFORE_PRODUCTION,
  type MemoItem,
} from "@/lib/admin/production-memo";

function MemoList({
  items,
  sectionTitleKey,
}: {
  items: MemoItem[];
  sectionTitleKey: MessageKey;
}) {
  const { t: tr, language } = useI18n();
  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-5">
      <h2 className="mb-3 sam-text-body font-medium text-sam-fg">{tr(sectionTitleKey)}</h2>
      {items.length === 0 ? (
        <AdminEmptyState ko={language !== "en"} message={tr("admin_memo_empty")} />
      ) : (
        /* 표준 표 — 상태 · ID · 내용 (정적 메모 목록) */
        <div className="overflow-x-auto">
          <table className="w-full border-collapse sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border text-left sam-text-xxs text-sam-muted">
                <th className="w-16 py-2 pr-2 font-medium">{language !== "en" ? "적용" : "Applied"}</th>
                <th className="w-24 py-2 pr-2 font-medium">ID</th>
                <th className="py-2 pr-2 font-medium">{language !== "en" ? "내용" : "Item"}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-sam-border/70 align-top ${item.applied ? "text-sam-muted" : "text-sam-fg"}`}
                >
                  <td className="py-2 pr-2">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sam-border bg-sam-surface"
                      aria-hidden
                    >
                      {item.applied ? (
                        <span className="text-signature">✓</span>
                      ) : (
                        <span className="text-sam-meta">□</span>
                      )}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2">{item.id}</td>
                  <td className={`py-2 pr-2 ${item.applied ? "line-through" : ""}`}>{item.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminMemoPage() {
  const { t: tr } = useI18n();
  return (
    <div className="space-y-8 p-6">
      <AdminPageHeader titleKey="admin_menu_memo" descriptionKey="admin_memo_page_intro" />

      <MemoList items={MANUAL_DURING_TEST} sectionTitleKey="admin_memo_section_manual" />
      <MemoList items={BEFORE_PRODUCTION} sectionTitleKey="admin_memo_section_before_prod" />

      <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-fg">
        <p className="font-medium">{tr("admin_memo_apply_how_title")}</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-sam-muted">
          <li>
            {tr("admin_memo_apply_li_edit_before")}
            <code className="rounded bg-sam-surface-muted px-1">lib/admin/production-memo.ts</code>
            {tr("admin_memo_apply_li_edit_after")}
          </li>
          <li>{tr("admin_memo_apply_li_done")}</li>
        </ul>
      </div>
    </div>
  );
}
