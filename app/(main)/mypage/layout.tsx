import type { ReactNode } from "react";
import { Suspense } from "react";
import { MypageToastHost } from "@/components/mypage/MypageToastHost";
import { MypageGuestGate } from "@/components/mypage/MypageGuestGate";
import { MypageScrollMemory } from "@/components/mypage/MypageScrollMemory";

export const dynamic = "force-dynamic";

type MypageLayoutProps = {
  children: ReactNode;
};

export default function MypageLayout({ children }: MypageLayoutProps) {
  return (
    <div className="sam-domain-shell">
      <Suspense fallback={null}>
        <MypageGuestGate>{children}</MypageGuestGate>
        <MypageScrollMemory />
      </Suspense>
      <MypageToastHost />
    </div>
  );
}
