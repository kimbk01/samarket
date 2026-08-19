import { redirect } from "next/navigation";

/** Legacy sales list — unified seller management lives on /mypage/products. */
export default function TradeSalesRedirectPage() {
  redirect("/mypage/products");
}
