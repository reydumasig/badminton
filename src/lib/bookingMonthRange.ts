/**
 * Max rows for one calendar month (3 courts × ~15 hrs × 31 days ≈ 1.4k slots).
 * Supabase defaults to 1,000 without an explicit limit — late-month days were dropped.
 */
export const BOOKINGS_MONTH_LIMIT = 5_000;

/** Inclusive ISO `date` bounds for a calendar month (`month` 1–12). */
export function bookingMonthRangeISO(year: number, month1Based: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month1Based)}-01`;
  const lastDay = new Date(year, month1Based, 0).getDate();
  const end = `${year}-${pad(month1Based)}-${pad(lastDay)}`;
  return { start, end };
}
