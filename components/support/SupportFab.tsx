"use client";

import { Headphones } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { SupportContext } from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { useSupportRequesterUnread } from "@/lib/support/use-support-requester-unread";

/**
 * 고객센터 FAB — 숫자 뱃지는 **헤드폰 아이콘 위에만** (Owner 2026-11-10).
 * - 숫자 = 답변이 왔는데 아직 안 연 문의 수(`support_cases.requester_unread_count` 합, 진행 중 문의만).
 * - 알림(종) 숫자와 별개 — 알림함에서 읽어도 줄지 않고, 그 문의를 열어야 줄어든다.
 * - 회원 화면 = 회원 문의만 / 사장님 화면 = 그 매장 문의만. 사장님 화면 FAB 는 갈색·「매장 고객센터」.
 */
export function SupportFab({
  context,
  className = "",
}: {
  context: SupportContext;
  className?: string;
}) {
  const { t } = useI18n();
  const owner = context.audience === "OWNER";
  const storeId = owner ? context.storeId?.trim() || null : null;
  const unread = useSupportRequesterUnread({
    audience: owner ? "OWNER" : "MEMBER",
    storeId,
    enabled: !owner || Boolean(storeId),
  });
  const label = owner ? t("support_fab_owner_label") : t("support_fab_label");
  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <button
      type="button"
      data-support-fab="1"
      data-support-fab-audience={owner ? "OWNER" : "MEMBER"}
      data-support-fab-unread={unread}
      aria-label={unread > 0 ? `${label}, ${t("support_fab_badge_aria", { count: unread })}` : label}
      className={`pointer-events-auto inline-flex h-11 items-center gap-1.5 rounded-full pl-3 pr-4 text-[14px] font-semibold text-sam-on-primary shadow-sam-elevated transition active:scale-[0.98] ${
        owner ? "bg-[var(--dibay-brown)]" : "bg-sam-primary"
      } ${className}`.trim()}
      onClick={() => {
        navigateToSupportCenter(context);
      }}
    >
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
        <Headphones className="h-5 w-5" strokeWidth={2} aria-hidden />
        {unread > 0 ? (
          <span
            className={`absolute -right-2 -top-2 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sam-danger px-1 text-[11px] font-bold leading-none text-sam-on-primary ring-2 ${
              owner ? "ring-[var(--dibay-brown)]" : "ring-sam-primary"
            }`}
            data-support-fab-badge="1"
            aria-hidden
          >
            {badge}
          </span>
        ) : null}
      </span>
      <span>{label}</span>
    </button>
  );
}
