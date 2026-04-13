import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createAuthServerClient } from "@/lib/supabase-auth-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bookingId, newDate, newCourtNumber, newStartTime } = body as {
      bookingId: string;
      newDate: string;
      newCourtNumber: number;
      newStartTime: string;
    };

    if (!bookingId || !newDate || !newCourtNumber || !newStartTime) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    // ── Auth: must be signed-in user ───────────────────────
    const supabaseAuth = await createAuthServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured." },
        { status: 503 }
      );
    }

    // ── Fetch booking ─────────────────────────────────────
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, date, start_time, court_number, user_id, status")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    // ── Ownership check ───────────────────────────────────
    if (booking.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorised." }, { status: 403 });
    }

    // ── Status check ──────────────────────────────────────
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "Only confirmed bookings can be rescheduled." },
        { status: 400 }
      );
    }

    // ── 24-hour window check ──────────────────────────────
    const slotTime = new Date(`${booking.date}T${booking.start_time}`);
    const hoursUntil = (slotTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntil <= 24) {
      return NextResponse.json(
        {
          error:
            "Rescheduling is only allowed more than 24 hours before your booking time.",
        },
        { status: 400 }
      );
    }

    // ── Same-slot check ───────────────────────────────────
    const isSameSlot =
      booking.date === newDate &&
      booking.court_number === newCourtNumber &&
      booking.start_time.substring(0, 5) === newStartTime.substring(0, 5);

    if (isSameSlot) {
      return NextResponse.json(
        { error: "Please choose a different slot." },
        { status: 400 }
      );
    }

    // ── Conflict check: is the new slot already taken? ────
    const { data: existingSlots } = await supabase
      .from("bookings")
      .select("id, start_time")
      .eq("date", newDate)
      .eq("court_number", newCourtNumber)
      .eq("status", "confirmed")
      .neq("id", bookingId); // exclude the booking being rescheduled

    const hasConflict = (existingSlots ?? []).some(
      (s) =>
        s.start_time.substring(0, 5) === newStartTime.substring(0, 5)
    );

    if (hasConflict) {
      return NextResponse.json(
        {
          error:
            "That slot was just booked by someone else. Please choose another.",
        },
        { status: 409 }
      );
    }

    // ── Apply reschedule ──────────────────────────────────
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        date: newDate,
        court_number: newCourtNumber,
        start_time: newStartTime,
      })
      .eq("id", bookingId);

    if (updateError) {
      console.error("[RESCHEDULE DB ERROR]", updateError.message);
      return NextResponse.json(
        { error: "Failed to reschedule booking." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[RESCHEDULE ERROR]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
