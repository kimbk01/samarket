import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type MyLayoutProps = {
  children: ReactNode;
};

export default function MyLayout({ children }: MyLayoutProps) {
  /** Same blank-band root as `/mypage` — Header mypage pale #F3F2EB. */
  return <div className="sam-domain-shell bg-[#F3F2EB]">{children}</div>;
}
