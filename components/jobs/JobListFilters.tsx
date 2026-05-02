"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { encodedTradeMarketSegment } from "@/lib/categories/tradeMarketPath";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { Sam } from "@/lib/ui/sam-component-classes";

const rowClass =
  "flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const selectCls = `${Sam.input.select} ${Sam.input.soft} h-8 max-w-[8.25rem] shrink-0 rounded-ui-rect px-1.5 py-0.5 text-[11px] leading-tight sm:max-w-[9rem] sm:text-[12px]`;

export function JobListFilters({ category }: { category: CategoryWithSettings }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = `/market/${encodedTradeMarketSegment(category)}`;

  const pushQs = useCallback(
    (mutate: (q: URLSearchParams) => void) => {
      const q = new URLSearchParams(searchParams.toString());
      mutate(q);
      ["jk", "je", "jr", "jc", "fs", "avail"].forEach((k) => {
        if (q.get(k) === "" || q.get(k) == null) q.delete(k);
      });
      const s = q.toString();
      router.replace(s ? `${basePath}?${s}` : basePath, { scroll: false });
    },
    [basePath, router, searchParams]
  );

  const jk = (searchParams.get("jk")?.trim().toLowerCase() ?? "") as "" | "hire" | "work";
  const je = searchParams.get("je")?.trim().toLowerCase() ?? "";
  const jr = searchParams.get("jr")?.trim().toLowerCase() ?? "";
  const jc = searchParams.get("jc")?.trim().toLowerCase() ?? "";
  const fs = searchParams.get("fs")?.trim().toLowerCase() ?? "";

  return (
    <div className={rowClass} aria-label="일자리 필터">
      <select
        className={selectCls}
        value={jk === "hire" ? "hire" : jk === "work" ? "work" : ""}
        aria-label="유형"
        onChange={(e) => {
          const v = e.target.value;
          pushQs((q) => {
            if (!v) q.delete("jk");
            else q.set("jk", v);
          });
        }}
      >
        <option value="">유형 · 전체</option>
        <option value="hire">사람 구해요</option>
        <option value="work">일자리 찾고 있어요</option>
      </select>

      <select
        className={selectCls}
        value={je}
        aria-label="기간·형태"
        onChange={(e) => {
          const v = e.target.value;
          pushQs((q) => {
            if (!v) q.delete("je");
            else q.set("je", v);
          });
        }}
      >
        <option value="">기간/형태 · 전체</option>
        <option value="long">장기</option>
        <option value="short">단기</option>
        <option value="one_day">하루</option>
        <option value="parttime">파트타임</option>
        <option value="remote">재택</option>
        <option value="discuss">협의</option>
        <option value="month_plus">1개월 이상</option>
        <option value="fulltime">정직원</option>
        <option value="short_alba">단기/알바</option>
      </select>

      <select
        className={selectCls}
        value={jc}
        aria-label="업종"
        onChange={(e) => {
          const v = e.target.value;
          pushQs((q) => {
            if (!v) q.delete("jc");
            else q.set("jc", v);
          });
        }}
      >
        <option value="">업종 · 전체</option>
        <option value="restaurant">식당/주방</option>
        <option value="serving_cafe">서빙/카페</option>
        <option value="retail">매장관리/판매</option>
        <option value="office">사무/통역</option>
        <option value="driver">운전/배송</option>
        <option value="cleaning">청소/가사</option>
        <option value="massage_spa">마사지/스파</option>
        <option value="construction">건설/현장</option>
        <option value="online">온라인/재택</option>
        <option value="other">기타</option>
      </select>

      <select
        className={selectCls}
        value={jr}
        aria-label="지역"
        onChange={(e) => {
          const v = e.target.value;
          pushQs((q) => {
            if (!v) q.delete("jr");
            else q.set("jr", v);
          });
        }}
      >
        <option value="">지역 · 전체</option>
        <option value="manila">마닐라</option>
        <option value="makati">마카티</option>
        <option value="bgc">BGC</option>
        <option value="pasay">파사이</option>
        <option value="quezon">퀘존</option>
        <option value="cebu">세부</option>
        <option value="clark">클락/앙헬레스</option>
        <option value="davao">다바오</option>
        <option value="other">기타</option>
      </select>

      <select
        className={selectCls}
        value={
          fs === "popular"
            ? "popular"
            : fs === "chat_desc"
              ? "chat_desc"
              : fs === "near"
                ? "near"
                : ""
        }
        aria-label="정렬"
        onChange={(e) => {
          const v = e.target.value;
          pushQs((q) => {
            q.delete("fs");
            if (!v || v === "latest") return;
            q.set("fs", v);
          });
        }}
      >
        <option value="">정렬 · 최신순</option>
        <option value="near">가까운순</option>
        <option value="chat_desc">문의많은순</option>
        <option value="popular">조회많은순</option>
      </select>
    </div>
  );
}
