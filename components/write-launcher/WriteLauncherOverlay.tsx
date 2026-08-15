"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

interface WriteLauncherOverlayProps {
  onClose: () => void;
  /** 생략 시 딤만 (패널은 형제 노드에 두는 경우) */
  children?: React.ReactNode;
  /** 루트 셸 클래스 — z-index 등 화면별 조정 */
  className?: string;
}

/**
 * dim 배경 + 바깥 클릭 시 닫기 — Overlay SSOT backdrop.
 */
export function WriteLauncherOverlay({ onClose, children, className }: WriteLauncherOverlayProps) {
  const { t } = useI18n();
  return (
    <div
      className={className ?? "fixed inset-0 z-[130]"}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={t("ui_write_launcher_menu_aria")}
      data-dibay-overlay="write-launcher"
    >
      <button
        type="button"
        className={`${OverlayUi.backdrop} !opacity-100`}
        aria-label={t("common_close")}
        onClick={onClose}
      />
      {children}
    </div>
  );
}
