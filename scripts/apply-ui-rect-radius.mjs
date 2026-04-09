/**
 * 사각형 UI 라운드를 `--ui-radius-rect`(4px)로 통일.
 * `rounded-full` 이 포함된 줄은 건너뜀(원형·pill 유지).
 * 실행: node scripts/apply-ui-rect-radius.mjs
 */
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) out.push(p);
  }
  return out;
}

const roots = ["app", "components", "lib"].map((d) => path.join(process.cwd(), d));
const files = roots.flatMap((d) => walk(d));

const T_RECT = "rounded-t-[length:var(--ui-radius-rect)]";
const B_RECT = "rounded-b-[length:var(--ui-radius-rect)]";

/** 순서: 긴/방향 접두가 먼저 */
const pairs = [
  [/sm:rounded-t-3xl/g, `sm:${T_RECT}`],
  [/sm:rounded-t-2xl/g, `sm:${T_RECT}`],
  [/sm:rounded-t-xl/g, `sm:${T_RECT}`],
  [/sm:rounded-t-lg/g, `sm:${T_RECT}`],
  [/sm:rounded-3xl/g, "sm:rounded-ui-rect"],
  [/sm:rounded-2xl/g, "sm:rounded-ui-rect"],
  [/sm:rounded-xl/g, "sm:rounded-ui-rect"],
  [/sm:rounded-lg/g, "sm:rounded-ui-rect"],
  [/sm:rounded-md/g, "sm:rounded-ui-rect"],
  [/sm:rounded-sm/g, "sm:rounded-ui-rect"],
  [/rounded-t-3xl/g, T_RECT],
  [/rounded-t-2xl/g, T_RECT],
  [/rounded-t-xl/g, T_RECT],
  [/rounded-t-lg/g, T_RECT],
  [/rounded-t-md/g, T_RECT],
  [/rounded-t-sm/g, T_RECT],
  [/rounded-b-3xl/g, B_RECT],
  [/rounded-b-2xl/g, B_RECT],
  [/rounded-b-xl/g, B_RECT],
  [/rounded-b-lg/g, B_RECT],
  [/rounded-b-md/g, B_RECT],
  [/rounded-b-sm/g, B_RECT],
  [/rounded-3xl/g, "rounded-ui-rect"],
  [/rounded-2xl/g, "rounded-ui-rect"],
  [/rounded-xl/g, "rounded-ui-rect"],
  [/rounded-lg/g, "rounded-ui-rect"],
  [/rounded-md/g, "rounded-ui-rect"],
  [/rounded-sm/g, "rounded-ui-rect"],
  [/rounded-t-\[\d+px\]/g, T_RECT],
  [/rounded-b-\[\d+px\]/g, B_RECT],
  [/rounded-\[32px\]/g, "rounded-ui-rect"],
  [/rounded-\[30px\]/g, "rounded-ui-rect"],
  [/rounded-\[28px\]/g, "rounded-ui-rect"],
  [/rounded-\[26px\]/g, "rounded-ui-rect"],
  [/rounded-\[24px\]/g, "rounded-ui-rect"],
  [/rounded-\[22px\]/g, "rounded-ui-rect"],
  [/rounded-\[20px\]/g, "rounded-ui-rect"],
  [/rounded-\[18px\]/g, "rounded-ui-rect"],
  [/rounded-\[16px\]/g, "rounded-ui-rect"],
  [/rounded-\[14px\]/g, "rounded-ui-rect"],
  [/rounded-\[12px\]/g, "rounded-ui-rect"],
  [/rounded-\[10px\]/g, "rounded-ui-rect"],
  [/rounded-\[8px\]/g, "rounded-ui-rect"],
  [/rounded-\[6px\]/g, "rounded-ui-rect"],
  [/rounded-\[5px\]/g, "rounded-ui-rect"],
  [/rounded-\[4px\]/g, "rounded-ui-rect"],
  [/rounded-\[3px\]/g, "rounded-ui-rect"],
  [/rounded-\[2px\]/g, "rounded-ui-rect"],
];

let changed = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const next = lines.map((line) => {
    if (line.includes("rounded-full")) return line;
    let c = line;
    for (const [re, rep] of pairs) {
      c = c.replace(re, rep);
    }
    return c;
  });
  const out = next.join("\n");
  const orig = lines.join("\n");
  if (out !== orig) {
    fs.writeFileSync(file, out);
    changed++;
  }
}
console.log(`[apply-ui-rect-radius] updated ${changed} files`);
