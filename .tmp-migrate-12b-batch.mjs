import fs from "node:fs";

// --- shared-order-demo catalog from shared-order-store.ts ---
const storePath = "lib/shared-orders/shared-order-store.ts";
const storeSrc = fs.readFileSync(storePath, "utf8");
const koStrings = [...storeSrc.matchAll(/(?:error|message):\s*"([^"]+)"/g)]
  .map((m) => m[1])
  .filter((s) => /[가-힣]/.test(s));
const templateStrings = [...storeSrc.matchAll(/message:\s*`([^`]+)`/g)].map((m) => m[1]);
const uniqueMsgs = [...new Set([...koStrings, ...templateStrings])];

function slug(s) {
  return s
    .replace(/\$\{[^}]+\}/g, "x")
    .replace(/[^a-zA-Z0-9가-힣]+/g, "_")
    .slice(0, 40)
    .replace(/^_|_$/g, "") || "msg";
}

const msgToKey = new Map();
const catalogKo = {};
const catalogEn = {};
let i = 0;
for (const msg of uniqueMsgs) {
  let base = `shared_order_demo_${slug(msg)}`;
  while (catalogKo[base]) base = `${base}_${++i}`;
  msgToKey.set(msg, base);
  catalogKo[base] = msg.replace(/\$\{([^}]+)\}/g, (_, v) => `{${v}}`);
  catalogEn[base] = msg; // placeholder — filled below from manual map
}

const enOverrides = {
  shared_order_demo_동일한_상태입니다: "Already in this status.",
  shared_order_demo_주문_없음: "Order not found.",
  shared_order_demo_사유가_필요합니다: "A reason is required.",
  shared_order_demo_메모가_필요합니다: "A memo is required.",
};

for (const [k, v] of Object.entries(catalogKo)) {
  catalogEn[k] = enOverrides[k] ?? v;
}

const catalogBody = `/** Phase 12b: legacy in-memory shared-order-store demo copy */
export const sharedOrderDemoMessages = {
  ko: ${JSON.stringify(catalogKo, null, 4).replace(/^/gm, "    ").slice(4)},
  en: ${JSON.stringify(catalogEn, null, 4).replace(/^/gm, "    ").slice(4)},
};
`;

fs.writeFileSync("lib/i18n/catalog/shared-order-demo.ts", catalogBody);

let nextStore = storeSrc;
nextStore =
  `import { translate, type MessageKey } from "@/lib/i18n/messages";\nimport { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";\n` +
  nextStore.replace(/^import /m, (m, off) => (off === 0 ? "" : m));
// fix duplicate imports - simpler prepend
if (!nextStore.includes("function soT(")) {
  const insertAfterImports = nextStore.indexOf("\n\nfunction clone");
  const soTHelper = `
function soT(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(DEFAULT_APP_LANGUAGE, key, vars);
}

`;
  nextStore =
    nextStore.slice(0, insertAfterImports) +
    soTHelper +
    nextStore.slice(insertAfterImports);
}

// Replace static strings in error/message fields
for (const [msg, key] of msgToKey) {
  if (msg.includes("${")) {
    const parts = msg.split(/\$\{([^}]+)\}/);
    // skip complex template for script — manual later
    continue;
  }
  nextStore = nextStore.split(`"${msg}"`).join(`soT("${key}")`);
}

fs.writeFileSync(storePath, nextStore);
console.log("shared-order keys:", Object.keys(catalogKo).length);
