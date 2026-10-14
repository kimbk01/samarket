import { DibayRuntimeEnvironmentBanner } from "@/components/runtime/DibayRuntimeEnvironmentBanner";
import { resolveRuntimeBannerVariant } from "@/lib/config/resolve-runtime-banner-variant";

/** Server host — resolves banner variant from process env at request time. */
export function DibayRuntimeEnvironmentBannerHost({
  forceProductionBadge = false,
}: {
  /** Admin shell always shows PRODUCTION badge on production deploy. */
  forceProductionBadge?: boolean;
}) {
  let { variant, projectRefHint } = resolveRuntimeBannerVariant();
  if (forceProductionBadge && variant === "hidden") {
    variant = "production";
  }
  return <DibayRuntimeEnvironmentBanner variant={variant} projectRefHint={projectRefHint} />;
}
