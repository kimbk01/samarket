"use client";

import Link from "next/link";
import type { PostListPreviewModel } from "@/lib/posts/post-list-preview-model";
import { formatPrice } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type MessengerTradeProductDockRowProps = {
  thumbnailUrl: string | null | undefined;
  line1: string;
  line2: string;
  detailHref: string;
  /** 썸네일·제목 링크 접근성 */
  productLabel: string;
};

/**
 * 메신저 거래 1:1 — ⋮ 메뉴 상단과 동일한 콤팩트 상품 한 줄(썸네일 48·2줄 텍스트).
 */
export function MessengerTradeProductDockRow({
  thumbnailUrl,
  line1,
  line2,
  detailHref,
  productLabel,
}: MessengerTradeProductDockRowProps) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2.5">
      <Link
        href={detailHref}
        className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)] transition active:opacity-90"
        aria-label={t("cm_ui_product_detail_view_aria", { label: productLabel })}
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center sam-text-xxs text-[color:var(--cm-room-text-muted)]">{t("cm_ui_product")}</div>
        )}
      </Link>
      <Link
        href={detailHref}
        className="min-w-0 flex-1 text-left transition active:opacity-90"
        aria-label={t("cm_ui_product_detail_view_aria", { label: productLabel })}
      >
        <p className="line-clamp-2 sam-text-body-secondary font-medium leading-snug text-[color:var(--cm-room-text)]">{line1}</p>
        <p className="mt-0.5 sam-text-xxs text-[color:var(--cm-room-text-muted)]">{line2}</p>
      </Link>
    </div>
  );
}

/** `팝니다 · 모델 · 연식` 형 제목 → 메뉴·독과 동일하게 앞 두 토큰만(높이 절약) */
export function compactMessengerTradeTitleHeadline(title: string): string {
  const raw = title.trim();
  if (!raw) return "product";
  const parts = raw.split("·").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} · ${parts[1]}`;
  return raw;
}

/** 피드 `listPreview` 가 있으면 칩+첫 본문(⋮ 메뉴·채팅 독 동일), 없으면 제목 압축 */
export function messengerTradeDockLine1(title: string, headerPreview: PostListPreviewModel | null | undefined): string {
  if (headerPreview?.listingChips?.length) {
    const chips = headerPreview.listingChips.map((c) => c.text).filter(Boolean).join(" · ");
    const trail = headerPreview.listingRowBoldText?.trim() ?? "";
    const head = [chips, trail].filter(Boolean).join(" · ");
    const body0 = headerPreview.bodyBlocks[0]?.text?.trim() ?? "";
    if (head && body0) return `${head} · ${body0}`;
    if (head) return compactMessengerTradeTitleHeadline(head);
  }
  return compactMessengerTradeTitleHeadline(title);
}

export function formatMessengerTradeDockPriceLine(price: number, currency: string, phaseLabel: string): string {
  return `${formatPrice(price, currency)} · ${phaseLabel}`;
}
