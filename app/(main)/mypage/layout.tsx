import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type MypageLayoutProps = {
  children: ReactNode;
};

export default function MypageLayout({ children }: MypageLayoutProps) {
  /** Match Header mypage pale (#F3F2EB) — not `:root` #F9F9F9 / cream shell. */
  return <div className="sam-domain-shell bg-[#F3F2EB]">{children}</div>;
}
