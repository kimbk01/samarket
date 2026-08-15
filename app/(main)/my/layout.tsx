import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type MyLayoutProps = {
  children: ReactNode;
};

export default function MyLayout({ children }: MyLayoutProps) {
  /** Same blank-band root as `/mypage` layout — domain pale, not cream shell. */
  return (
    <div className="sam-domain-shell bg-[color:var(--dibay-domain-surface,var(--sector-header-bg,#F3F2EB))]">
      {children}
    </div>
  );
}
