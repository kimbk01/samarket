"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface WriteLauncherOverlayProps {
  onClose: () => void;
  /** 생략 시 딤만 (패널은 형제 노드에 두는 경우) */
  children?: React.ReactNode;
  /** 루트 딤 레이어 클래스 — z-index·블러 등 화면별 조정 */
  className?: string;
}

/**
 * dim 배경 + 바깥 클릭 시 닫기 (참고 이미지와 동일한 톤)
 */
export function WriteLauncherOverlay({ onClose, children, className }: WriteLauncherOverlayProps) {
  const { t } = useI18n();
  return (
    <div
      className={className ?? "fixed inset-0 z-[130] bg-black/30"}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={t("ui_write_launcher_menu_aria")}
    >
      {children}
    </div>
  );
}
