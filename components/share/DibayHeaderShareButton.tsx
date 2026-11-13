"use client";

/**
 * 머리글 오른쪽 「공유」 아이콘 — 화면마다 공유는 이 버튼 1곳 (Owner 2026-11-14 「공유는 게시물의 헤더」).
 * 설계 `docs/audit/dibay-unified-share-audit-design-2026-11-14.md` §N-3 · 시안 `docs/design/dibay-header-share-mockup-2026-11-14.html`.
 * - 그림 = 매장 머리글과 같은 공유 모양(Share2) · 크기·터치는 놓이는 머리글의 버튼 클래스를 그대로 받는다(헤더 SSOT S5).
 * - 위치 = 맨 오른쪽 아이콘 바로 왼쪽(호출부가 순서를 지킨다).
 */
import { Share2 } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function DibayHeaderShareButton({
  onClick,
  buttonClassName,
  glyphClassName,
}: {
  onClick: () => void;
  buttonClassName: string;
  glyphClassName?: string;
}) {
  const { t } = useI18n();
  return (
    <button type="button" className={buttonClassName} aria-label={t("common_share")} onClick={onClick} data-dibay-header-share="">
      <Share2 className={glyphClassName} strokeWidth={2} aria-hidden />
    </button>
  );
}
