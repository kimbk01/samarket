import type { ReactNode } from "react";
import { MypageToastHost } from "@/components/mypage/MypageToastHost";

export const dynamic = "force-dynamic";

type MypageLayoutProps = {
  children: ReactNode;
};

export default function MypageLayout({ children }: MypageLayoutProps) {
  return (
    <div className="sam-domain-shell">
      {children}
      <MypageToastHost />
    </div>
  );
}
