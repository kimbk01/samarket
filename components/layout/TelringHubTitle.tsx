/**
 * telRING 워드마크 — dibaY 의 Y 처럼 대문자 부분(RING)만 노랑 (시안 1, Owner 2026-11-19).
 * 휴대폰 1단(`RegionBarMainHubTier1`)·태블릿 분할 머리글(`MessengerSplitTopBar`, 시안 §4-1) 공용.
 * 표기가 「소문자+대문자」 꼴이 아니면 한 색 글자로 그린다. 색은 `.dibay-hub-title` 안에서만 정해진다.
 */
export function TelringHubTitle({ label }: { label: string }) {
  const m = /^([a-z]+)([A-Z]+)$/.exec(label);
  if (!m) return <>{label}</>;
  return (
    <>
      {m[1]}
      <span className="dibay-hub-title-accent">{m[2]}</span>
    </>
  );
}
