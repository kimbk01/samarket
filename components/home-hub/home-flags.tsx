/**
 * 홈 환율 칸 국기 (시안 v2 §3-1) — 작은 크기(약 18px)용 단순화 그림. 홈 환율 칸에서만 쓴다.
 */
export function FlagPH({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" aria-hidden>
      <rect width="30" height="10" fill="#0038A8" />
      <rect y="10" width="30" height="10" fill="#CE1126" />
      <path d="M0 0L17.3 10 0 20z" fill="#FFFFFF" />
      <circle cx="6" cy="10" r="2.4" fill="#FCD116" />
      <circle cx="2" cy="3.2" r="0.9" fill="#FCD116" />
      <circle cx="2" cy="16.8" r="0.9" fill="#FCD116" />
      <circle cx="13.2" cy="10" r="0.9" fill="#FCD116" />
    </svg>
  );
}

export function FlagKR({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 20" aria-hidden>
      <rect width="30" height="20" fill="#FFFFFF" />
      <circle cx="15" cy="10" r="5" fill="#0047A0" />
      <path d="M10 10a5 5 0 0 1 10 0 2.5 2.5 0 0 1-5 0 2.5 2.5 0 0 0-5 0z" fill="#CD2E3A" />
      <g stroke="#000" strokeWidth="1.1">
        <path d="M4.2 4.6l2.6-1.9M4.9 5.6l2.6-1.9M5.6 6.6l2.6-1.9" />
        <path d="M21.8 13.4l2.6 1.9M22.5 12.4l2.6 1.9M23.2 11.4l2.6 1.9" />
        <path d="M4.2 15.4l2.6 1.9M4.9 14.4l2.6 1.9M5.6 13.4l2.6 1.9" />
        <path d="M21.8 6.6l2.6-1.9M22.5 7.6l2.6-1.9M23.2 8.6l2.6-1.9" />
      </g>
      <rect x="0.25" y="0.25" width="29.5" height="19.5" fill="none" stroke="#D9DDD9" strokeWidth="0.5" />
    </svg>
  );
}
