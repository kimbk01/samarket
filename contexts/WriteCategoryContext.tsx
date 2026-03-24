"use client";

import { createContext, useContext, useState } from "react";

type WriteCategoryContextValue = {
  /** 포스트 상세 등에서 보고 있는 글의 카테고리 slug → 플로팅 글쓰기 버튼이 이 카테고리로 바로 이동 */
  writeCategorySlug: string | null;
  setWriteCategorySlug: (slug: string | null) => void;
};

const WriteCategoryContext = createContext<WriteCategoryContextValue | null>(null);

export function WriteCategoryProvider({ children }: { children: React.ReactNode }) {
  const [writeCategorySlug, setWriteCategorySlug] = useState<string | null>(null);
  return (
    <WriteCategoryContext.Provider value={{ writeCategorySlug, setWriteCategorySlug }}>
      {children}
    </WriteCategoryContext.Provider>
  );
}

export function useWriteCategory() {
  const ctx = useContext(WriteCategoryContext);
  return ctx;
}
