"use client";

import { useId } from "react";

/** SAMarket 기본 프로필 얼굴 — SVG 파일 내장 체크 뱃지 없음 */
export function SamarketDefaultAvatarFace({ className = "" }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const bgId = `sam-avatar-bg-${uid}`;
  const markId = `sam-avatar-mark-${uid}`;

  return (
    <svg
      className={className}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={bgId} x1="48" y1="32" x2="208" y2="224" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#EAF2FF" />
          <stop offset="1" stopColor="#D7E5FF" />
        </linearGradient>
        <linearGradient id={markId} x1="76" y1="64" x2="184" y2="190" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3478F6" />
          <stop offset="1" stopColor="#1F5ED9" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="128" fill={`url(#${bgId})`} />
      <circle cx="128" cy="96" r="42" fill={`url(#${markId})`} />
      <path
        d="M56 207c10-42 37-67 72-67s62 25 72 67c2 8-4 17-13 17H69c-9 0-15-9-13-17Z"
        fill={`url(#${markId})`}
      />
    </svg>
  );
}
