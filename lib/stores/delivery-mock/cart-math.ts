import type { DeliveryCartLine, DeliveryMenuItem, DeliveryMenuOptionGroup } from "./types";

export function optionExtraForGroup(
  group: DeliveryMenuOptionGroup,
  selectedOptionIds: string[]
): { extra: number; names: string[] } {
  const map = new Map(group.options.map((o) => [o.id, o]));
  let extra = 0;
  const names: string[] = [];
  for (const id of selectedOptionIds) {
    const o = map.get(id);
    if (o) {
      extra += o.priceDelta;
      names.push(o.name);
    }
  }
  return { extra, names };
}

export function validateOptionSelections(
  groups: DeliveryMenuOptionGroup[],
  selected: Record<string, string[]>
): string | null {
  for (const g of groups) {
    const sel = selected[g.id] ?? [];
    if (sel.length < g.minSelect) return `${g.nameKo}을(를) 선택해 주세요.`;
    if (sel.length > g.maxSelect) return `${g.nameKo} 선택 개수를 줄여 주세요.`;
  }
  return null;
}

export function computeUnitTotal(item: DeliveryMenuItem, selected: Record<string, string[]>): number {
  let t = item.price;
  for (const g of item.optionGroups) {
    const sel = selected[g.id] ?? [];
    const { extra } = optionExtraForGroup(g, sel);
    t += extra;
  }
  return t;
}

export function computeLineTotal(line: DeliveryCartLine): number {
  const optExtra = line.selections.reduce(
    (s, g) => s + g.options.reduce((a, o) => a + o.priceDelta, 0),
    0
  );
  return (line.basePrice + optExtra) * line.quantity;
}

export function computeSubtotal(lines: DeliveryCartLine[]): number {
  return lines.reduce((s, l) => s + computeLineTotal(l), 0);
}

export function computeGrandTotal(
  subtotal: number,
  deliveryFee: number,
  mode: "delivery" | "pickup"
): number {
  return subtotal + (mode === "delivery" ? deliveryFee : 0);
}

export function summarizeOptions(line: DeliveryCartLine): string {
  const parts = line.selections.flatMap((g) =>
    g.options.length ? [`[${g.groupNameKo}] ${g.options.map((o) => o.name).join(", ")}`] : []
  );
  return parts.join(" · ") || "옵션 없음";
}
