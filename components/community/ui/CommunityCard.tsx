import type { HTMLAttributes, ReactNode } from "react";
import { CM_CARD_CLASS, CM_CARD_PAD_CLASS } from "@/lib/community/community-ui-classes";

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padded?: boolean;
};

export function CommunityCard({ children, className = "", padded = true, ...rest }: Props) {
  return (
    <div
      className={[CM_CARD_CLASS, padded ? CM_CARD_PAD_CLASS : "", className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
