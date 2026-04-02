import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthServerClient } from "@/lib/supabase-auth";

export async function POST(req: NextRequest) {
  try {
    const { bookingId } = await req.json();

    if (!bookingId) {
      return NextResponse.json({ error: "Missing booking ID." }, { status: 400 });
    }

    // Verify the requester is logged in and owns this booking
    const supabaseAuth = await createAuthServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured." }, { status: 503 });
    }

    // Fetch the booking to validate ownership and timing
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, date, start_time, user_id, status")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    if (booking.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorised." }, { status: 403 });
    }

    if (booking.status === "cancelled") {
      return NextResponse.json({ error: "Booking is already cancelled." }, { status: 400 });
    }

    // Enforce 2-hour cancellation window
    const slotTime = new Date(`${booking.date}T${booking.start_time}`);
    const hoursUntil = (slotTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil <= 2) {
      return NextResponse.json(
        { error: "Bookings can only be cancelled more than 2 hours before the slot." },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to cancel booking." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[CANCEL ERROR]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
