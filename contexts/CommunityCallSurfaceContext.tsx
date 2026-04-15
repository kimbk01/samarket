"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export type CommunityCallSurfaceValue = {
  /** URL `/community-messenger/rooms/[roomId]` 에서 파싱한 방 ID */
  messengerRoomIdFromPath: string | null;
};

const CommunityCallSurfaceContext = createContext<CommunityCallSurfaceValue>({
  messengerRoomIdFromPath: null,
});

export function CommunityCallSurfaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const messengerRoomIdFromPath = useMemo(() => {
    const m = pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  }, [pathname]);
  return (
    <CommunityCallSurfaceContext.Provider value={{ messengerRoomIdFromPath }}>{children}</CommunityCallSurfaceContext.Provider>
  );
}

export function useCommunityCallSurface(): CommunityCallSurfaceValue {
  return useContext(CommunityCallSurfaceContext);
}
