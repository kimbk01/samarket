import fs from "fs";
const p = "components/stores/StoreCommerceCartPageClient.tsx";
let c = fs.readFileSync(p, "utf8");
const closeTag = String.fromCharCode(60, 47, 100, 105, 118, 62);
c = c.replaceAll("</motion.div>", closeTag);
fs.writeFileSync(p, c);
console.log("fixed to", closeTag);
