"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useEffect, useMemo, useState } from "react";
import { getViewerUserId } from "@/lib/auth/viewer-user-id";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getRecentViewedProducts } from "@/lib/recommendation/recommendation-recent-viewed-state";
import { RecentViewedCard } from "./RecentViewedCard";

export function RecentViewedList() {
  const { t } = useI18n();
  const [userId, setUserId] = useState(() => getViewerUserId());

  useEffect(() => {
    const sync = () => setUserId(getViewerUserId());
    sync();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(TEST_AUTH_CHANGED_EVENT, sync);
  }, []);

  const records = useMemo(
    () => getRecentViewedProducts(userId, 50),
    [userId]
  );

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="sam-text-body text-sam-muted">{t("ui_recent_empty")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {records.map((r) => (
        <li key={r.id}>
          <RecentViewedCard record={r} />
        </li>
      ))}
    </ul>
  );
}
