"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "samarket_admin_show_member_uuid";

/**
 * 어드민 회원 관리: 회원 UUID 컬럼·상세 노출 여부 (기본 숨김, localStorage 유지)
 */
export function useAdminMemberUuidVisibility(): {
  showMemberUuid: boolean;
  setShowMemberUuid: (v: boolean) => void;
} {
  const [showMemberUuid, setState] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setState(true);
    } catch {
      /* ignore */
    }
  }, []);

  const setShowMemberUuid = useCallback((v: boolean) => {
    setState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  return { showMemberUuid, setShowMemberUuid };
}
