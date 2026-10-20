/**
 * Admin 켜기/끄기 스위치 (수정 계획 2-2) — 설정 행의 사용/사용안함 토글.
 * role=switch + aria-checked. 화면에서 `<button role="switch">` 를 직접 쓰지 않고 이 부품을 쓴다.
 * 클릭은 부모 행으로 전파되지 않는다 (목록 행 선택과 분리).
 */

export function AdminSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** 접근성 이름 (화면에 보이는 라벨이 따로 없을 때) */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-admin-switch={checked ? "on" : "off"}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={[
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)]",
        checked ? "bg-sam-success" : "bg-sam-border",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-sam-surface shadow transition-transform ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
