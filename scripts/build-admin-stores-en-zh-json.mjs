import fs from "node:fs";
import { adminStoresEn, adminStoresZh } from "./admin-stores-en-zh-data.mjs";

const ko = JSON.parse(fs.readFileSync(".tmp-admin-stores-ko.json", "utf8"));
const koKeys = Object.keys(ko);
const enKeys = Object.keys(adminStoresEn);
const zhKeys = Object.keys(adminStoresZh);

const missingEn = koKeys.filter((k) => !adminStoresEn[k]);
const missingZh = koKeys.filter((k) => !adminStoresZh[k]);
if (missingEn.length || missingZh.length) {
  console.error("Missing en:", missingEn);
  console.error("Missing zh:", missingZh);
  process.exit(1);
}

const extraEn = enKeys.filter((k) => !ko[k]);
const extraZh = zhKeys.filter((k) => !ko[k]);
if (extraEn.length) console.warn("Extra en keys:", extraEn);
if (extraZh.length) console.warn("Extra zh keys:", extraZh);

fs.writeFileSync(
  ".tmp-admin-stores-en-zh.json",
  JSON.stringify({ en: adminStoresEn, "zh-CN": adminStoresZh }, null, 2)
);
console.log(`OK ${koKeys.length} keys`);
