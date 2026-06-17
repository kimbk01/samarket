"use client";

import type { ReactNode } from "react";
import { CommunityMessengerHomeDetailEmpty } from "@/components/community-messenger/home/CommunityMessengerHomeDetailEmpty";

type Props = {
  list: ReactNode;
  detail?: ReactNode;
  showDetail: boolean;
};

export function CommunityMessengerHomeMasterDetail({ list, detail, showDetail }: Props) {
  return (
    <div className="flex min-h-0 w-full flex-1 md:min-h-[calc(100dvh-var(--main-bottom-nav-height,0px)-3.5rem)]">
      <div className="min-h-0 w-full shrink-0 overflow-hidden border-sam-border md:w-[min(420px,38vw)] md:border-r">
        {list}
      </div>
      <div className="hidden min-h-0 min-w-0 flex-1 md:flex md:flex-col">
        {showDetail && detail ? detail : <CommunityMessengerHomeDetailEmpty />}
      </div>
    </div>
  );
}
