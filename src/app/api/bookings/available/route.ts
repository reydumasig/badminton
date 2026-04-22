import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid or missing date." }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("court_number, start_time")
    .eq("date", date)
    .eq("status", "confirmed");

  if (error) {
    return NextResponse.json({ error: "Failed to fetch availability." }, { status: 500 });
  }

  // Return booked slots as array of "COURT:TIME" strings for easy lookup
  const booked = (data ?? []).map((b) => ({
    court: b.court_number,
    time: b.start_time.substring(0, 5), // "08:00"
  }));

  return NextResponse.json({ booked });
}
