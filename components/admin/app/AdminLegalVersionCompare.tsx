"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLegalDocumentRow } from "@/lib/legal/app-legal-documents";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

function lineDiff(a: string, b: string): Array<{ type: "same" | "add" | "del"; text: string }> {
  const left = a.split("\n");
  const right = b.split("\n");
  const max = Math.max(left.length, right.length);
  const out: Array<{ type: "same" | "add" | "del"; text: string }> = [];
  for (let i = 0; i < max; i++) {
    const L = left[i];
    const R = right[i];
    if (L === R) {
      if (L != null) out.push({ type: "same", text: L });
    } else {
      if (L != null) out.push({ type: "del", text: L });
      if (R != null) out.push({ type: "add", text: R });
    }
  }
  return out;
}

/** Side-by-side / line compare for two Legal CMS docs (same kind preferred). */
export function AdminLegalVersionCompare({ documents }: { documents: AppLegalDocumentRow[] }) {
  const { t, safeT } = useI18n();
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [active, setActive] = useState(false);

  const left = documents.find((d) => d.id === leftId) ?? null;
  const right = documents.find((d) => d.id === rightId) ?? null;
  const rows = useMemo(() => {
    if (!active || !left || !right) return [];
    return lineDiff(left.body || "", right.body || "");
  }, [active, left, right]);

  return (
    <div className="mt-6 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-testid="admin-legal-version-compare">
      <h2 className="font-semibold text-sam-fg">
        {safeT("admin_legal_version_compare")}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-sam-muted">{t("admin_app_base")}</span>
          <select
            className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            value={leftId}
            onChange={(e) => {
              setLeftId(e.target.value);
              setActive(false);
            }}
          >
            <option value="">{t("admin_app_select")}</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.kind}/{d.locale} · {d.version} · {d.status}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-sam-muted">{t("admin_app_compare_b")}</span>
          <select
            className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
            value={rightId}
            onChange={(e) => {
              setRightId(e.target.value);
              setActive(false);
            }}
          >
            <option value="">{t("admin_app_select")}</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.kind}/{d.locale} · {d.version} · {d.status}
              </option>
            ))}
          </select>
        </label>
      </div>
      <AdminActionButton
        variant="secondary"
        disabled={!leftId || !rightId || leftId === rightId}
        onClick={() => setActive(true)}
      >
        {t("admin_app_compare")}
      </AdminActionButton>
      {active && left && right ? (
        <div className="space-y-2">
          <p className="sam-text-helper text-sam-muted">
            {left.kind}/{left.locale} {left.version} → {right.kind}/{right.locale} {right.version}
          </p>
          <pre className="max-h-[420px] overflow-auto rounded-ui-rect bg-sam-app p-3 text-[12px] leading-5">
            {rows.map((r, i) => (
              <div
                key={i}
                className={
                  r.type === "add"
                    ? "bg-sam-success-soft text-sam-success"
                    : r.type === "del"
                      ? "bg-sam-danger-soft text-sam-danger"
                      : "text-sam-fg"
                }
              >
                {r.type === "add" ? "+ " : r.type === "del" ? "- " : "  "}
                {r.text}
              </div>
            ))}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
