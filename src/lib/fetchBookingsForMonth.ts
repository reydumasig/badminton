import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingMonthRangeISO } from "@/lib/bookingMonthRange";

/** PostgREST / Supabase max rows per request (project default). */
const PAGE_SIZE = 1000;

export type BookingRow = {
  id: string;
  created_at: string;
  date: string;
  start_time: string;
  court_number: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  payment_proof_url?: string | null;
};

/** Load every booking row for a calendar month (paginated). */
export async function fetchBookingsForMonth(
  supabase: SupabaseClient,
  year: number,
  month1Based: number
): Promise<BookingRow[]> {
  const { start, end } = bookingMonthRangeISO(year, month1Based);
  const all: BookingRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;
    all.push(...(data as BookingRow[]));
    if (data.length < PAGE_SIZE) break;
  }

  return all;
}
