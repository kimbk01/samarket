import { RouteLoadingLabel } from "@/components/i18n/RouteLoadingLabel";

export default function ProductDetailLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="h-8 w-8 animate-pulse rounded-full bg-sam-border-soft" />
      <RouteLoadingLabel />
    </div>
  );
}
