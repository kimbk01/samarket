import type { ReactNode } from "react";
import { Suspense } from "react";
import { MypageToastHost } from "@/components/mypage/MypageToastHost";
import { MypageGuestGate } from "@/components/mypage/MypageGuestGate";
import { DibayPendingSpinner } from "@/components/ui/DibaySpinner";

export const dynamic = "force-dynamic";

type MypageLayoutProps = {
  children: ReactNode;
};

export default function MypageLayout({ children }: MypageLayoutProps) {
  return (
    <div className="sam-domain-shell">
      {/* 빈 본문 대신 DIBAY 대기 스피너(450ms 뒤) — loading-spinner 설계 W2 */}
      <Suspense fallback={<DibayPendingSpinner />}>
        <MypageGuestGate>{children}</MypageGuestGate>
      </Suspense>
      <MypageToastHost />
    </div>
  );
}
