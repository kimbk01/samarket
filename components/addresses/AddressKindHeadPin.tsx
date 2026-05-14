"use client";

/** 주소 본문 앞 머리 핀 — 대표 / 일반 / 매장(연결) 시각 구분 */
export function AddressKindHeadPin(props: {
  kind: "master" | "store" | "general";
  className?: string;
}) {
  const { kind, className = "" } = props;
  const aria =
    kind === "master" ? "대표 주소" : kind === "store" ? "매장 연결 주소" : "일반 주소";
  const tone =
    kind === "master" ? "text-rose-600" : kind === "store" ? "text-slate-600" : "text-slate-400";
  return (
    <span
      className={`inline-flex shrink-0 select-none ${tone} ${className}`.trim()}
      role="img"
      aria-label={aria}
    >
      <svg
        className="h-[1.15rem] w-[0.95rem]"
        viewBox="0 0 24 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M12 0C5.37 0 0 5.2 0 11.62c0 8.12 12 20.38 12 20.38s12-12.26 12-20.38C24 5.2 18.63 0 12 0z"
          fill="currentColor"
        />
        <circle cx="12" cy="11" r="4.2" fill="white" />
      </svg>
    </span>
  );
}
