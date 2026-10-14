import { DibayRuntimeEnvironmentBanner } from "@/components/runtime/DibayRuntimeEnvironmentBanner";
import { resolveRuntimeBannerVariant } from "@/lib/config/resolve-runtime-banner-variant";

/** Server host — resolves banner variant from process env at request time. */
export function DibayRuntimeEnvironmentBannerHost({
  forceProductionBadge = false,
}: {
  /** Admin shell always shows PRODUCTION badge on production deploy. */
  forceProductionBadge?: boolean;
}) {
  const resolved = resolveRuntimeBannerVariant();
  const projectRefHint = resolved.projectRefHint;
  const variant =
    forceProductionBadge && resolved.variant === "hidden"
      ? "production"
      : resolved.variant;
  return <DibayRuntimeEnvironmentBanner variant={variant} projectRefHint={projectRefHint} />;
}
