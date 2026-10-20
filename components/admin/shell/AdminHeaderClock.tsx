"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { formatAdminHeaderClock } from "@/lib/admin/metrics/manila-period";

/**
 * 관리자 헤더 시계 (설계 v4 §6) — 「2026-10-20 (화) 17:27 PHT」, 기기 시간대와 무관하게 Asia/Manila.
 * 서버 렌더 시각과 클라이언트 시각이 달라 생기는 하이드레이션 불일치를 피하려고 마운트 후에만 시각을 그린다.
 */
export function AdminHeaderClock() {
  const { t, language } = useI18n();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    setNow(new Date());
    // 분 경계에 맞춘 뒤 60초마다 갱신.
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const align = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, msToNextMinute);
    return () => {
      clearTimeout(align);
      if (interval) clearInterval(interval);
    };
  }, []);

  const label = now ? formatAdminHeaderClock(now, language === "en" ? "en" : "ko") : "";

  return (
    <span
      className="admin-header-clock hidden shrink-0 whitespace-nowrap text-[12px] font-semibold tabular-nums text-[var(--admin-console-muted)] lg:inline"
      title={t("admin_shell_clock_label")}
      aria-label={label ? `${t("admin_shell_clock_label")} ${label}` : t("admin_shell_clock_label")}
      data-admin-header-clock="1"
    >
      {label}
    </span>
  );
}
