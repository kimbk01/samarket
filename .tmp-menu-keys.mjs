import fs from "fs";

const src = fs.readFileSync("components/admin/admin-menu.ts", "utf8");
const keys = [...src.matchAll(/key: "([^"]+)"/g)].map((m) => m[1]);
const mapStart = src.indexOf("ADMIN_MENU_TITLE_KEY_BY_ITEM_KEY");
const mapEnd = src.indexOf("};", mapStart) + 2;
const mapBlock = src.slice(mapStart, mapEnd);
const mapped = new Set([...mapBlock.matchAll(/"([^"]+)":/g)].map((m) => m[1]));
const missing = keys.filter((k) => !mapped.has(k));
console.log("missing", missing.length);
console.log(missing.join("\n"));
