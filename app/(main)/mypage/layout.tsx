import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type MypageLayoutProps = {
  children: ReactNode;
};

export default function MypageLayout({ children }: MypageLayoutProps) {
  /** Override `.sam-domain-shell` cream (`bg-sam-app`) with domain pale — blank-band root. */
  return (
    <div className="sam-domain-shell bg-[color:var(--dibay-domain-surface,var(--sector-header-bg,#F3F2EB))]">
      {children}
    </div>
  );
}
