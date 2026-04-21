"use client";

import Link from "next/link";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

/** 짧은 히어로 — 업종 패널·피드로 자연스럽게 이어지도록 앵커 연결 */
export function StorePromoHeroBanner() {
  return (
    <Link
      href="/stores#store-industry-explore"
      className={`block p-3 ${FB.card} active:opacity-[0.92]`}
    >
      <p className={`sam-text-helper font-semibold uppercase tracking-wide ${FB.metaSm}`}>한눈에</p>
      <p className={`mt-1 ${FB.name}`}>업종 골라 바로 들어가기</p>
      <p className={`mt-1 ${FB.meta}`}>식당·마트·생활까지 탭만 바꾸면 세부가 바뀌어요.</p>
      <span className={`mt-2 inline-block sam-text-body ${FB.link}`}>업종 열기</span>
    </Link>
  );
}
