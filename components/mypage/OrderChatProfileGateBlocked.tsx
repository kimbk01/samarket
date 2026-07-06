"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { requireAuthAction } from "@/lib/auth/require-auth-action";

/** 주문 채팅 RSC 진입 — 프로필 미완성 시 모달만 띄우고 방 리다이렉트를 막는다. */
export function OrderChatProfileGateBlocked({
  orderId,
  detailHref,
}: {
  orderId: string;
  detailHref: string;
}) {
  const { safeT, t } = useI18n();
  const chatHref = `/mypage/store-orders/${encodeURIComponent(orderId)}/chat`;

  useEffect(() => {
    void requireAuthAction(
      "order_chat",
      () => {
        window.location.assign(chatHref);
      },
      { next: chatHref }
    );
  }, [chatHref]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-sam-app px-4 text-center">
      <p className="text-sm text-sam-fg">
        {safeT("profile_completion_body_messenger", {
          fallbackKo: "메신저를 이용하려면 프로필을 먼저 완성해 주세요.",
          fallbackEn: "Complete your profile before using messenger.",
        })}
      </p>
      <Link href={detailHref} className="text-sm font-medium text-signature underline">
        {t("route_store_orders_back_link")}
      </Link>
    </div>
  );
}
