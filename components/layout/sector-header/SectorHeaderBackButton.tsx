"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import { AppBackButton } from "@/components/navigation/AppBackButton";

type SectorHeaderBackButtonProps = {
  backHref?: string;
  interceptBack?: () => boolean;
  preferHistoryBack?: boolean;
  onBack?: () => void;
  className?: string;
  ariaLabelKey?: MessageKey;
  ariaLabel?: string;
  variant?: "back" | "close";
};

/**
 * 섹터 헤더 뒤로 — `AppBackButton` 얇은 별칭 (S-10).
 * 이동 규칙·연타 잠금·클래스(`sector-header-back`)는 `AppBackButton` 한 곳만 정의한다.
 */
export function SectorHeaderBackButton(props: SectorHeaderBackButtonProps) {
  return <AppBackButton {...props} />;
}
