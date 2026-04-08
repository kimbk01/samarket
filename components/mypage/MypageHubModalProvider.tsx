"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { MypageAccountHubModal } from "@/components/mypage/MypageAccountHubModal";
import { MypageProfileEditModal } from "@/components/mypage/MypageProfileEditModal";

type MypageHubModalContextValue = {
  openAccountHub: () => void;
  openProfileEdit: () => void;
};

const MypageHubModalContext = createContext<MypageHubModalContextValue | null>(null);

export function useMypageHubModal(): MypageHubModalContextValue {
  const v = useContext(MypageHubModalContext);
  if (!v) {
    throw new Error("useMypageHubModal must be used within MypageHubModalProvider");
  }
  return v;
}

/** RegionBar 등 Provider 밖에서는 호출하지 않음 */
export function useMypageHubModalOptional(): MypageHubModalContextValue | null {
  return useContext(MypageHubModalContext);
}

export function MypageHubModalProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isMypageRoot = pathname === "/mypage";

  useEffect(() => {
    if (!isMypageRoot) {
      setAccountOpen(false);
      setProfileOpen(false);
    }
  }, [isMypageRoot]);

  const openAccountHub = useCallback(() => {
    if (!isMypageRoot) return;
    setAccountOpen(true);
  }, [isMypageRoot]);

  const openProfileEdit = useCallback(() => {
    if (!isMypageRoot) return;
    setProfileOpen(true);
  }, [isMypageRoot]);

  const value = useMemo(
    () => ({
      openAccountHub,
      openProfileEdit,
    }),
    [openAccountHub, openProfileEdit]
  );

  return (
    <MypageHubModalContext.Provider value={value}>
      {children}
      {isMypageRoot ? (
        <>
          <MypageAccountHubModal open={accountOpen} onClose={() => setAccountOpen(false)} />
          <MypageProfileEditModal open={profileOpen} onClose={() => setProfileOpen(false)} />
        </>
      ) : null}
    </MypageHubModalContext.Provider>
  );
}
