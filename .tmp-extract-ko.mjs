import fs from "node:fs";

const s = fs.readFileSync("lib/i18n/catalog/admin.ts", "utf8");
const start = s.indexOf("    admin_page_store_orders:");
const end = s.indexOf("    admin_stores_reports_err_table_missing:", start);
const block = s.slice(start, end);
const ko = {};
let curKey = null;
let curVal = "";
for (const line of block.split("\n")) {
  const km = line.match(/^\s+(admin_[a-z0-9_]+):\s*"(.*)"\s*,?\s*$/);
  if (km) {
    if (curKey) ko[curKey] = curVal;
    curKey = km[1];
    curVal = km[2];
    continue;
  }
  const km2 = line.match(/^\s+(admin_[a-z0-9_]+):\s*$/);
  if (km2) {
    if (curKey) ko[curKey] = curVal;
    curKey = km2[1];
    curVal = "";
    continue;
  }
  const cont = line.match(/^\s*"(.*)"\s*,?\s*$/);
  if (cont && curKey) {
    curVal = cont[1];
    ko[curKey] = curVal;
    curKey = null;
    curVal = "";
  }
}
if (curKey) ko[curKey] = curVal;
fs.writeFileSync(".tmp-admin-stores-ko.json", JSON.stringify(ko, null, 2));
console.log(Object.keys(ko).length);
