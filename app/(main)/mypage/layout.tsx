import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type MypageLayoutProps = {
  children: ReactNode;
};

export default function MypageLayout({ children }: MypageLayoutProps) {
  return children;
}
