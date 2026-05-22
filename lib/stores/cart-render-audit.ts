/**
 * Cart render audit — dev always; prod when `NEXT_PUBLIC_DIBAY_CART_FLOW_V2=1`
 */

type RenderAuditPayload = {
  component: string;
  render_count: number;
  reason: string;
  props_changed: boolean;
  context_changed: boolean;
  render_ms: number;
};

const counts = new Map<string, number>();

function auditEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_CART_FLOW_V2 === "1";
}

export function cartRenderAudit(
  component: string,
  opts: {
    reason: string;
    props_changed?: boolean;
    context_changed?: boolean;
  }
): void {
  if (!auditEnabled()) return;
  const prev = counts.get(component) ?? 0;
  const render_count = prev + 1;
  counts.set(component, render_count);
  const t0 = performance.now();
  queueMicrotask(() => {
    const payload: RenderAuditPayload = {
      component,
      render_count,
      reason: opts.reason,
      props_changed: opts.props_changed ?? false,
      context_changed: opts.context_changed ?? false,
      render_ms: Math.round(performance.now() - t0),
    };
    if (render_count <= 4 || render_count % 5 === 0) {
      // eslint-disable-next-line no-console -- perf contract
      console.log("[cart-render-audit]", payload);
    }
  });
}
