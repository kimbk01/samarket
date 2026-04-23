import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type MyLayoutProps = {
  children: ReactNode;
};

export default function MyLayout({ children }: MyLayoutProps) {
  return <div className="sam-domain-shell">{children}</div>;
}
