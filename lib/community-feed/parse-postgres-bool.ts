/**
 * `row_to_json`·API JSON 등에서 오는 `boolean` / 문자열 / 숫자를 안전히 boolean 으로.
 * `!!"false"` → true 가 되는 실수를 막는다(노출 `is_visible` 오판 방지).
 */
export function parsePostgresBool(value: unknown, whenMissing: boolean = false): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (value == null) return whenMissing;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "t" || s === "true" || s === "1" || s === "yes" || s === "on" || s === "y") return true;
    if (s === "f" || s === "false" || s === "0" || s === "no" || s === "off" || s === "n" || s === "") return false;
  }
  return whenMissing;
}
