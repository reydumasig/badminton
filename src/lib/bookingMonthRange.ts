/** Inclusive ISO `date` bounds for a calendar month (`month` 1–12). */
export function bookingMonthRangeISO(year: number, month1Based: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month1Based)}-01`;
  const lastDay = new Date(year, month1Based, 0).getDate();
  const end = `${year}-${pad(month1Based)}-${pad(lastDay)}`;
  return { start, end };
}
