import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

/**
 * GET /api/cron/auto-cancel
 *
 * Called by Vercel Cron every 5 minutes.
 * Finds all tentative bookings older than 1 hour with no proof of payment
 * and marks them as cancelled — freeing the slot for other users.
 *
 * Protected by CRON_SECRET env var.
 */
export async function GET(req: NextRequest) {
  // Verify this is a legitimate cron call
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  // Find tentative bookings created more than 1 hour ago with no proof
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: expired, error: fetchError } = await supabase
    .from("bookings")
    .select("id, name, email, date, start_time, court_number")
    .eq("status", "tentative")
    .is("payment_proof_url", null)
    .lt("created_at", cutoff);

  if (fetchError) {
    console.error("[AUTO-CANCEL] Fetch error:", fetchError.message);
    return NextResponse.json({ error: "Failed to fetch bookings." }, { status: 500 });
  }

  if (!expired || expired.length === 0) {
    return NextResponse.json({ cancelled: 0, message: "No expired bookings." });
  }

  const ids = expired.map((b) => b.id);

  const { error: updateError } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .in("id", ids);

  if (updateError) {
    console.error("[AUTO-CANCEL] Update error:", updateError.message);
    return NextResponse.json({ error: "Failed to cancel bookings." }, { status: 500 });
  }

  console.log(`[AUTO-CANCEL] Cancelled ${ids.length} expired tentative booking(s):`, ids);

  return NextResponse.json({
    cancelled: ids.length,
    bookings: expired.map((b) => ({
      id: b.id,
      name: b.name,
      date: b.date,
      court: b.court_number,
      time: b.start_time,
    })),
  });
}
