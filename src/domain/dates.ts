/**
 * Fechas de negocio como texto ISO (AAAA-MM-DD / AAAA-MM) en zona Buenos Aires.
 * Evita corrimientos de zona horaria al comparar vencimientos.
 */
export const BA_TZ = "America/Argentina/Buenos_Aires";
/** Argentina no aplica horario de verano desde 2009: offset fijo UTC−03:00. */
export const BA_UTC_OFFSET = "-03:00";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

const pad = (n: number, len = 2) => String(n).padStart(len, "0");

export function isValidMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

export function daysInMonth(month: string): number {
  const [y = NaN, m = NaN] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isRealDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const month = `${match[1]}-${match[2]}`;
  if (!isValidMonth(month)) return false;
  const day = Number(match[3]);
  return day >= 1 && day <= daysInMonth(month);
}

export function todayInBuenosAires(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function currentMonthInBuenosAires(now?: Date): string {
  return todayInBuenosAires(now).slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y = NaN, m = NaN] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const ny = Math.floor(index / 12);
  return `${pad(ny, 4)}-${pad(index - ny * 12 + 1)}`;
}

function toUtcMs(date: string): number {
  const [y = NaN, m = NaN, d = NaN] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): string {
  const dt = new Date(ms);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * 86_400_000);
}

export function diffInDays(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}

export function lastDayOfMonth(month: string): string {
  return `${month}-${pad(daysInMonth(month))}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatMonthLabel(month: string): string {
  const [y = NaN, m = NaN] = month.split("-").map(Number);
  return capitalize(
    new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    ),
  );
}

export function formatDate(date: string): string {
  if (!date) return "Sin programar";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateLong(date: string): string {
  return capitalize(
    new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(toUtcMs(date))),
  );
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: BA_TZ,
  }).format(new Date(iso));
}

