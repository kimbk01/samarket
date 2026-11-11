import { Fragment } from "react";

/**
 * `@회원 아이디` 글자 — 말줄임 금지, 줄을 바꿀 때는 `.` `_` 뒤에서만 (QR 친구 시안 3판 화면 규칙, 2026-11-12).
 * 숫자·글자 중간에서 끊지 않는다(「manila / 2026」 결함). 아이디는 최대 20자(`DIBAY_ID_RE`).
 */
export function MemberAtIdText({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
  /** 구 iOS WebView 는 정규식 lookbehind 를 못 읽어 직접 나눈다 */
  const parts: string[] = [];
  let cur = "";
  for (const ch of value) {
    cur += ch;
    if (ch === "." || ch === "_") {
      parts.push(cur);
      cur = "";
    }
  }
  if (cur) parts.push(cur);
  return (
    <span className={className} style={style} data-copyable="">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
