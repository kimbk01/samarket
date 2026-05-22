const { execSync } = require("child_process");
const fs = require("fs");

const rel = "components/stores/StoreProductPublic.tsx";
let s = execSync(`git show 50c207c:${rel}`, { encoding: "utf8" });

s = s.replace(
  'import { fetchStoreProductPublicDeduped } from "@/lib/stores/store-delivery-api-client";',
  [
    'import { fetchStoreProductPublicDeduped } from "@/lib/stores/store-delivery-api-client";',
    'import { OWN_STORE_ORDER_BLOCK_MESSAGE } from "@/lib/stores/store-orderability-policy";',
  ].join("\n")
);
s = s.replace('const OWN_STORE_ORDER_BLOCK_MESSAGE = "본인 매장은 주문할 수 없습니다";\n\n', "");
s = s.replace(
  'import { parseMediaUrlsJson } from "@/lib/stores/parse-media-urls-json";',
  [
    "import {",
    "  buildStoreProductGalleryUrls,",
    "  resolveStoreProductPrimaryImageUrl,",
    '} from "@/lib/stores/store-product-display-media";',
  ].join("\n")
);
s = s.replace(
  /const detailGalleryUrls = useMemo\(\(\) => \{[\s\S]*?\}, \[product\]\);\s*\n\s*const heroImageUrl = useMemo\(\(\) => \{[\s\S]*?\}, \[product, detailGalleryUrls\]\);/,
  `const detailGalleryUrls = useMemo(() => {
    if (!product) return [];
    return buildStoreProductGalleryUrls(product.thumbnail_url, product.images_json, 12);
  }, [product]);

  const heroImageUrl = useMemo(() => {
    if (!product) return "";
    return resolveStoreProductPrimaryImageUrl(product.thumbnail_url, product.images_json);
  }, [product]);`
);
s = s.replace('window.alert("링크를 복사했습니다.");', 'window.alert(t("store_link_copied"));');
s = s.replaceAll(
  'showStoreDetailToast(st.id, "카트에 담았어요");',
  'showStoreDetailToast(st.id, t("store_added_to_cart_toast", { title: pr.title }));'
);
s = s.replace(
  'setCartErr("카트에 담을 수 없습니다.");',
  'setCartErr(t("store_err_cart_add_failed"));'
);
s = s.replace(
  `          showStoreDetailToast(st.id, t("store_added_to_cart_toast", { title: pr.title }));
          goToStoreMenu(st.slug);`,
  `          showStoreDetailToast(
            st.id,
            t("store_added_to_cart_toast", { title: pr.title })
          );
          goToStoreMenu(st.slug);`
);
s = s.replace(
  'if (product.is_owner_recommended) badges.push("사장님 추천");\n  if (product.is_featured || product.is_representative) badges.push("인기");',
  [
    'if (product.is_owner_recommended) badges.push(t("store_badge_owner_recommended"));',
    'if (product.is_featured || product.is_representative) badges.push(t("store_badge_menu_popular"));',
  ].join("\n  ")
);
s = s.replace(
  '        : trackInv && product.stock_qty < minQ\n          ? `재고가 최소 주문 수량(${minQ}개)보다 적습니다.`\n          : null;',
  '        : trackInv && product.stock_qty < minQ\n          ? t("store_stock_below_min", { min: minQ })\n          : null;'
);
s = s.replace(
  '      thumbnailUrl: pr.thumbnail_url?.trim() || null,',
  '      thumbnailUrl:\n        resolveStoreProductPrimaryImageUrl(pr.thumbnail_url, pr.images_json) || null,'
);

const buf = Buffer.from(s, "utf8");
fs.writeFileSync(rel, buf);
if (!s.includes("StoreProductDetailPageChrome")) {
  console.error("patch failed");
  process.exit(1);
}
// UTF-16 regression guard
if (buf[0] === 0xff && buf[1] === 0xfe) {
  console.error("UTF-16 BOM detected");
  process.exit(1);
}
if (buf.includes(0)) {
  console.error("NUL in file — likely UTF-16");
  process.exit(1);
}
console.log("patched", rel, buf.length);
