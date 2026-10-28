"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

/**
 * 볼 수 없는 거래 글 (Owner 2026-10-28 승인 시안 ①) — 숨김·삭제·없는 글 상세는 404 대신 이 안내.
 * 찜·최근 본 글·채팅·알림처럼 예전에 저장된 링크로 들어와도 「페이지를 찾을 수 없어요」가 뜨지 않는다.
 * `onBack` — 거래방 상세 슬라이드처럼 화면 이동 대신 닫기가 「뒤로」인 곳.
 */
export function TradePostUnavailable({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <div
      data-trade-post-unavailable="1"
      className="flex min-h-[70dvh] flex-col items-center justify-center bg-sam-app px-6 text-center"
    >
      <EyeOff className="h-9 w-9 text-sam-meta" strokeWidth={1.75} aria-hidden />
      <p className="mt-3 sam-text-body-lg font-semibold text-sam-fg">{t("trade_unavailable_title")}</p>
      <p className="mt-1.5 sam-text-body-secondary text-sam-muted">{t("trade_unavailable_body")}</p>
      <Link
        href="/market"
        className="mt-7 flex h-11 w-full max-w-[240px] items-center justify-center rounded-ui-rect bg-sam-primary sam-text-body font-semibold text-sam-on-primary"
      >
        {t("trade_unavailable_browse")}
      </Link>
      <button
        type="button"
        onClick={() => (onBack ? onBack() : runHistoryBackWithFallback(router, "/market"))}
        className="mt-2 flex h-11 w-full max-w-[240px] items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface sam-text-body font-medium text-sam-fg"
      >
        {t("trade_unavailable_back")}
      </button>
    </div>
  );
}
