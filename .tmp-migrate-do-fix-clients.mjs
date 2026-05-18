import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "components/admin/delivery-orders");

function fix(name, hook = "  const { t } = useI18n();\n", extraImport = "") {
  let c = fs.readFileSync(path.join(dir, name), "utf8");
  if (!c.includes("useI18n")) {
    c = c.replace(
      '"use client";\n',
      `"use client";\n\nimport { useI18n } from "@/components/i18n/AppLanguageProvider";\n${extraImport}`
    );
  }
  if (!c.includes("const { t")) {
    c = c.replace(/export function \w+\([^)]*\) \{\n/, (m) => m + hook);
  }
  return c;
}

fs.writeFileSync(
  path.join(dir, "DeliveryCancellationsClient.tsx"),
  fix("DeliveryCancellationsClient.tsx")
    .replace(
      `      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        DB 스키마상 취소 단계는{" "}
        <code className="rounded bg-sam-app px-1 sam-text-helper">cancelled</code> 로 확정된 건만 조회합니다. 추가
        처리는{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        과 주문 상세에서 진행하세요.
      </p>`,
      `      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        {t("admin_do_cancellations_intro")}{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>
      </p>`
    ),
  "utf8"
);

fs.writeFileSync(path.join(dir, "DeliveryOrdersByStoreClient.tsx"), fix("DeliveryOrdersByStoreClient.tsx"), "utf8");
fs.writeFileSync(path.join(dir, "DeliveryOrdersByBuyerClient.tsx"), fix("DeliveryOrdersByBuyerClient.tsx"), "utf8");

fs.writeFileSync(
  path.join(dir, "DeliveryRefundsClient.tsx"),
  fix("DeliveryRefundsClient.tsx")
    .replace(
      `      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        <code className="rounded bg-sam-app px-1 sam-text-helper">order_status = refund_requested</code> 원장만
        표시합니다. 승인은 DB API로 처리하고, 거절·기타 조정은{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        에서 이어가세요.
      </p>`,
      `      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        {t("admin_do_refunds_intro")}{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>
      </p>`
    )
    .replace("}, [load]);", "}, [load, t]);"),
  "utf8"
);

fs.writeFileSync(
  path.join(dir, "DeliveryReportsClient.tsx"),
  fix("DeliveryReportsClient.tsx", "  const { t, language } = useI18n();\n", 'import { doAdminLocale } from "./do-admin-locale";\n')
    .replace(
      `      <p className="mb-3 sam-text-body-secondary leading-relaxed text-sam-muted">
        <code className="rounded bg-sam-app px-1 sam-text-helper">store_reports</code> 실데이터입니다. 상태 변경·메모·기각은{" "}
        <Link href="/admin/store-reports" className="font-medium text-signature underline">
          매장·상품 신고
        </Link>{" "}
        콘솔에서 처리하세요.
      </p>`,
      `      <p className="mb-3 sam-text-body-secondary leading-relaxed text-sam-muted">
        {t("admin_do_reports_intro")}{" "}
        <Link href="/admin/store-reports" className="font-medium text-signature underline">
          {t("admin_do_reports_console")}
        </Link>{" "}
        {t("admin_do_reports_console_suffix")}
      </p>`
    )
    .replace("}, []);", "}, [t]);"),
  "utf8"
);

fs.writeFileSync(
  path.join(dir, "DeliverySettlementsClient.tsx"),
  fix("DeliverySettlementsClient.tsx")
    .replace(
      `      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        주문 단위 정산 스냅샷은 원장 매핑 기준이며, 실제 지급·보류는{" "}
        <Link href="/admin/store-settlements" className="text-signature underline">
          매장 정산
        </Link>
        과 동일 DB를 참고하세요. 환불·목록 액션은{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          매장 주문(액션)
        </Link>
        에서 처리합니다.
      </p>`,
      `      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        {t("admin_do_settlements_intro")}{" "}
        <Link href="/admin/store-settlements" className="text-signature underline">
          {t("admin_do_settlements_store_link")}
        </Link>
        {t("admin_do_settlements_intro_mid")}{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>
      </p>`
    ),
  "utf8"
);

fs.writeFileSync(
  path.join(dir, "DeliveryAuditLogsClient.tsx"),
  fix("DeliveryAuditLogsClient.tsx", "  const { t, language } = useI18n();\n", 'import { doAdminLocale } from "./do-admin-locale";\n')
    .replace(
      `      <p className="mb-3 sam-text-body-secondary text-sam-muted">
        <code className="rounded bg-sam-app px-1 sam-text-helper">target_type = store_order</code> 감사 기록입니다. 전체
        감사는{" "}
        <Link href="/admin/audit-logs" className="text-signature underline">
          감사 로그
        </Link>
        메뉴를 이용하세요.
      </p>`,
      `      <p className="mb-3 sam-text-body-secondary text-sam-muted">
        {t("admin_do_audit_intro")}{" "}
        <Link href="/admin/audit-logs" className="text-signature underline">
          {t("admin_do_audit_menu")}
        </Link>
        {t("admin_do_audit_menu_suffix")}
      </p>`
    )
    .replace("}, []);", "}, [t]);"),
  "utf8"
);

let progress = fs.readFileSync(path.join(dir, "DeliveryOrdersProgressPanel.tsx"), "utf8");
if (!progress.includes("const { t }")) {
  progress = progress.replace(
    "}) {\n  const stats = useMemo",
    "}) {\n  const { t } = useI18n();\n  const stats = useMemo"
  );
}
progress = progress
  .replace(`chip(\n          "전체",`, `chip(\n          t("admin_do_progress_all"),`)
  .replace(`chip(\n          "진행 중",`, `chip(\n          t("admin_do_progress_active"),`)
  .replace(`chip(\n          "취소·환불",`, `chip(\n          t("admin_do_progress_cancel_refund"),`);
fs.writeFileSync(path.join(dir, "DeliveryOrdersProgressPanel.tsx"), progress, "utf8");

console.log("client fixes done");
