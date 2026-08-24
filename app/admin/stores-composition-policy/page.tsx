import { permanentRedirect } from "next/navigation";

export default function AdminStoresCompositionPolicyLegacyRedirectPage() {
  permanentRedirect("/admin/stores-home-shelves");
}
