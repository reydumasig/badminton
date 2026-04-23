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

  // Belt-and-suspenders cleanup: cancel expired tentative bookings inline.
  // Admin-created bookings (email = 'admin@internal') are exempt — admins can
  // hold slots tentatively without a payment deadline.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: expired } = await supabase
    .from("bookings")
    .select("id")
    .eq("status", "tentative")
    .neq("email", "admin@internal")
    .is("payment_proof_url", null)
    .lt("created_at", cutoff);

  if (expired && expired.length > 0) {
    const ids = expired.map((b) => b.id);
    await supabase.from("bookings").update({ status: "cancelled" }).in("id", ids);
    console.log(`[AUTO-CANCEL] Cancelled ${ids.length} expired tentative booking(s) on availability check`);
  }

  // Fetch booked slots — both confirmed AND tentative block a court
  const { data, error } = await supabase
    .from("bookings")
    .select("court_number, start_time")
    .eq("date", date)
    .in("status", ["confirmed", "tentative"]);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch availability." }, { status: 500 });
  }

  const booked = (data ?? []).map((b) => ({
    court: b.court_number,
    time: b.start_time.substring(0, 5),
  }));

  return NextResponse.json({ booked });
}
