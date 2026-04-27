"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t: tr } = useI18n();
  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-5">
      <h2 className="mb-3 sam-text-body font-medium text-sam-fg">{tr(sectionTitleKey)}</h2>
      {items.length === 0 ? (
        <p className="sam-text-body text-sam-muted">{tr("admin_memo_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-3 sam-text-body ${
                item.applied ? "text-sam-muted" : "text-sam-fg"
              }`}
            >
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sam-border bg-sam-surface"
                aria-hidden
              >
                {item.applied ? (
                  <span className="text-signature">✓</span>
                ) : (
                  <span className="text-sam-meta">□</span>
                )}
              </span>
              <span className={item.applied ? "line-through" : ""}>
                [{item.id}] {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminMemoPage() {
  const { t: tr } = useI18n();
  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-sam-fg">{tr("admin_memo_page_title")}</h1>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{tr("admin_memo_page_intro")}</p>
      </div>

      <MemoList items={MANUAL_DURING_TEST} sectionTitleKey="admin_memo_section_manual" />
      <MemoList items={BEFORE_PRODUCTION} sectionTitleKey="admin_memo_section_before_prod" />

      <div className="rounded-ui-rect border border-amber-100 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-800">
        <p className="font-medium">{tr("admin_memo_apply_how_title")}</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-amber-700">
          <li>
            {tr("admin_memo_apply_li_edit_before")}
            <code className="rounded bg-amber-100 px-1">lib/admin/production-memo.ts</code>
            {tr("admin_memo_apply_li_edit_after")}
          </li>
          <li>{tr("admin_memo_apply_li_done")}</li>
        </ul>
      </div>
    </div>
  );
}
