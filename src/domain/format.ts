import type { Currency } from "./schemas";

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(n: number, maxDigits = 2): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: maxDigits }).format(n);
}

export function formatPercent(ratio: number): string {
  return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 0 }).format(
    ratio,
  );
}

