"use client";

import type { OwnerOrderLog } from "@/lib/store-owner/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";

function fmt(iso: string, lang: AppLanguageCode) {
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OwnerOrderTimeline({ logs }: { logs: OwnerOrderLog[] }) {
  const { t, language } = useI18n();
  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  if (sorted.length === 0) {
    return <p className="text-sm text-sam-muted">{t("business_phase7_234")}</p>;
  }
  return (
    <ol className="relative space-y-0 border-l-2 border-sam-border pl-4">
      {sorted.map((l) => (
        <li key={l.id} className="mb-4 ml-1 last:mb-0">
          <span className="absolute -left-[9px] mt-1.5 h-3 w-3 rounded-full bg-sam-surface ring-2 ring-sam-border" />
          <p className="text-xs text-sam-muted">{fmt(l.created_at, language)}</p>
          <p className="text-sm font-semibold text-sam-fg">
            {l.message ?? t("store_owner_timeline_status_change")}
          </p>
          <p className="text-xs text-sam-muted">
            {l.actor_name} ({l.actor_type})
            {l.from_status && l.to_status ? (
              <>
                {" "}
                · {l.from_status} → {l.to_status}
              </>
            ) : null}
          </p>
          {l.memo ? <p className="mt-1 text-xs text-sam-muted">{t("business_phase7_092", { v1: l.memo })}</p> : null}
        </li>
      ))}
    </ol>
  );
}
