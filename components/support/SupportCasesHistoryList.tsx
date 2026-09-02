"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { openSupportModal } from "@/lib/support/support-modal-controller";
import type { SupportCaseRow } from "@/lib/support/support-case-types";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

export function SupportCasesHistoryList({
  audience,
  storeId,
}: {
  audience: "MEMBER" | "OWNER";
  storeId?: string | null;
}) {
  const { safeT, language } = useI18n();
  const [cases, setCases] = useState<SupportCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ audience });
      if (audience === "OWNER" && storeId) qs.set("storeId", storeId);
      const res = await fetch(`/api/support/cases?${qs.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        cases?: SupportCaseRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "load_failed");
        setCases([]);
        return;
      }
      setCases(json.cases ?? []);
    } catch {
      setError("network_error");
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [audience, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const locale = language === "ko" ? "ko-KR" : "en-US";

  if (loading) {
    return (
      <p className="px-4 py-6 text-sm text-sam-muted">
        {safeT("common_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-red-600">{error}</p>
        <button type="button" className="mt-2 text-sm underline" onClick={() => void load()}>
          {safeT("common_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
        </button>
      </div>
    );
  }
  if (cases.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-sam-muted">
        {safeT("support_history_empty", {
          fallbackKo: "상담 내역이 없습니다.",
          fallbackEn: "No support conversations yet.",
        })}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-sam-border" data-support-cases-history="1">
      {cases.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className="flex w-full min-h-11 items-start gap-3 px-4 py-3 text-left transition active:bg-sam-surface-muted"
            onClick={() => {
              openSupportModal({ caseId: c.id });
            }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-sam-fg">
                {c.public_case_no || c.subject || c.id.slice(0, 8)}
              </p>
              <p className={`${OverlayUi.caption} !mb-0 mt-0.5`}>
                {c.category}
                {c.audience === "OWNER" && c.owner_store_id
                  ? ` · Store ${c.owner_store_id.slice(0, 8)}…`
                  : ""}
                {" · "}
                {c.status}
              </p>
              <p className={`${OverlayUi.caption} !mb-0`}>
                {c.last_message_at
                  ? new Date(c.last_message_at).toLocaleString(locale)
                  : ""}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
