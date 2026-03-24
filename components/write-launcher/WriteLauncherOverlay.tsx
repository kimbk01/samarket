"use client";

interface WriteLauncherOverlayProps {
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * dim 배경 + 바깥 클릭 시 닫기 (참고 이미지와 동일한 톤)
 */
export function WriteLauncherOverlay({ onClose, children }: WriteLauncherOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-30 bg-black/30"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="글쓰기 메뉴"
    >
      {children}
    </div>
  );
}
