import type { Currency, Position } from "./schemas";
import { CURRENCIES } from "./schemas";

export const RECONCILIATION_TOLERANCE = 0.01;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CurrencyReconciliation {
  currency: Currency;
  computed: number;
  declared: number | null;
  /** declarado − calculado; null si el PDF no declara total para la moneda */
  difference: number | null;
  reconciled: boolean;
}

export function reconcilePosition(position: Pick<Position, "items" | "declaredTotals">) {
  const result: CurrencyReconciliation[] = [];
  for (const currency of CURRENCIES) {
    const items = position.items.filter((i) => i.currency === currency);
    const declaredEntry = position.declaredTotals.find((t) => t.currency === currency);
    if (items.length === 0 && !declaredEntry) continue;
    const computed = round2(items.reduce((acc, i) => acc + i.marketValue, 0));
    const declared = declaredEntry ? round2(declaredEntry.amount) : null;
    const difference = declared === null ? null : round2(declared - computed);
    result.push({
      currency,
      computed,
      declared,
      difference,
      reconciled: difference !== null && Math.abs(difference) <= RECONCILIATION_TOLERANCE,
    });
  }
  return result;
}

