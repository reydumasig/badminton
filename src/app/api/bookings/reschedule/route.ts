import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { createAuthServerClient } from "@/lib/supabase-auth-server";

const resend = new Resend(process.env.RESEND_API_KEY);

function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  return `${h % 12 || 12}:00 ${h >= 12 ? "PM" : "AM"}`;
}
function formatEndTime(t: string) {
  const [h] = t.split(":").map(Number);
  const next = h + 1;
  return next >= 24 ? "12:00 MN" : formatTime(`${next.toString().padStart(2, "0")}:00`);
}
function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

/**
 * POST /api/bookings/reschedule
 *
 * Rebooking flow:
 *  1. Verify auth & ownership
 *  2. Booking must be confirmed (paid — DP or full)
 *  3. Original slot must be ≥ 24 hours away
 *  4. New slot must be free (confirmed + tentative checked)
 *  5. Create new confirmed booking on new slot
 *  6. Transfer payment_proof_url from original to new booking
 *  7. Cancel original booking (frees the slot)
 *  8. Send rebook confirmation email
 */
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
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // ── Auth: admin session OR logged-in user ─────────────────
    const cookieStore = await cookies();
    const adminSession  = cookieStore.get("admin_session")?.value;
    const isAdmin = !!(adminSession && process.env.ADMIN_PASSWORD && adminSession === process.env.ADMIN_PASSWORD);

    let userId: string | null = null;
    if (!isAdmin) {
      const supabaseAuth = await createAuthServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
      userId = user.id;
    }

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

    // ── Fetch original booking ────────────────────────────────
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, date, start_time, court_number, user_id, status, name, email, phone, payment_proof_url")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    }

    // ── Ownership (admin bypasses this check) ─────────────────
    if (!isAdmin && booking.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorised." }, { status: 403 });
    }

    // ── Must be a paid (confirmed) booking ────────────────────
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: "Only confirmed (paid) bookings can be rebooked." },
        { status: 400 }
      );
    }

    // ── 24-hour window check ──────────────────────────────────
    const slotTime   = new Date(`${booking.date}T${booking.start_time}`);
    const hoursUntil = (slotTime.getTime() - Date.now()) / 3_600_000;
    if (hoursUntil <= 24) {
      return NextResponse.json(
        { error: "Rebooking is only allowed more than 24 hours before your original slot." },
        { status: 400 }
      );
    }

    // ── Same-slot check ───────────────────────────────────────
    const isSameSlot =
      booking.date === newDate &&
      booking.court_number === newCourtNumber &&
      booking.start_time.substring(0, 5) === newStartTime.substring(0, 5);

    if (isSameSlot) {
      return NextResponse.json({ error: "Please choose a different slot." }, { status: 400 });
    }

    // ── Conflict check on new slot (confirmed + tentative) ────
    const { data: conflicts } = await supabase
      .from("bookings")
      .select("id, start_time")
      .eq("date", newDate)
      .eq("court_number", newCourtNumber)
      .in("status", ["confirmed", "tentative"]);

    const hasConflict = (conflicts ?? []).some(
      (s) => s.start_time?.substring(0, 5) === newStartTime.substring(0, 5)
    );

    if (hasConflict) {
      return NextResponse.json(
        { error: "That slot is already taken. Please choose another." },
        { status: 409 }
      );
    }

    // ── Step 1: Create new confirmed booking on new slot ──────
    const { data: newBooking, error: insertError } = await supabase
      .from("bookings")
      .insert({
        date:              newDate,
        start_time:        newStartTime,
        court_number:      newCourtNumber,
        name:              booking.name,
        email:             booking.email,
        phone:             booking.phone,
        status:            "confirmed",
        user_id:           userId ?? booking.user_id,
        payment_proof_url: booking.payment_proof_url ?? null,
      })
      .select("id, date, start_time, court_number, name, email, phone, status, payment_proof_url")
      .single();

    if (insertError || !newBooking) {
      if (insertError?.code === "23505") {
        return NextResponse.json(
          { error: "That slot was just taken. Please choose another." },
          { status: 409 }
        );
      }
      console.error("[REBOOK INSERT ERROR]", insertError?.message);
      return NextResponse.json({ error: "Failed to create new booking." }, { status: 500 });
    }

    // ── Step 2: Cancel original booking ──────────────────────
    const { error: cancelError } = await supabase
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", bookingId);

    if (cancelError) {
      // New booking was created — log but don't fail the request.
      // Admin can clean up the dangling original if needed.
      console.error("[REBOOK CANCEL ERROR] Original not cancelled:", cancelError.message);
    }

    // ── Step 3: Send rebook confirmation email ────────────────
    const apiKey       = process.env.RESEND_API_KEY;
    const academyEmail = process.env.ACADEMY_EMAIL;
    const fromLabel    = formatDate(booking.date);
    const toLabel      = formatDate(newDate);

    if (apiKey && booking.email) {
      await Promise.allSettled([
        // Customer confirmation
        resend.emails.send({
          from:    "Badminton District <onboarding@resend.dev>",
          to:      [booking.email],
          subject: `Booking Rescheduled – ${toLabel}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
              <h2 style="color:#111;">✅ Your Booking Has Been Rescheduled</h2>
              <p style="color:#555;">Hi ${booking.name}, your court booking has been moved to a new slot. Your payment has been transferred to the new booking — no further action needed.</p>

              <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
                <tr style="border-bottom:1px solid #eee;">
                  <td style="padding:10px 0;color:#777;width:80px;vertical-align:top;">From</td>
                  <td style="padding:10px 0;color:#ef4444;">
                    <s>Court ${booking.court_number} · ${fromLabel} · ${formatTime(booking.start_time)}–${formatEndTime(booking.start_time)}</s>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;color:#777;vertical-align:top;">To</td>
                  <td style="padding:10px 0;font-weight:600;color:#16a34a;">
                    Court ${newCourtNumber} · ${toLabel} · ${formatTime(newStartTime)}–${formatEndTime(newStartTime)}
                  </td>
                </tr>
              </table>

              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;font-size:13px;color:#166534;">
                ✅ <strong>Payment transferred.</strong> Your original payment (DP or full) has been applied to the new slot.
              </div>

              <p style="margin-top:20px;font-size:13px;color:#555;">
                Need to make changes? Visit your
                <a href="https://www.badmintonph.com/dashboard" style="color:#2563eb;">booking dashboard</a>.
              </p>

              <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
              <p style="font-size:12px;color:#999;">Badminton District · Block 1 Lot 2 Loresville Drive, Lores Farm Subdivision, Barangay San Roque, Antipolo</p>
              <p style="font-size:12px;color:#999;">📱 +63 9272222657</p>
            </div>
          `,
        }),
        // Academy notification
        ...(academyEmail ? [resend.emails.send({
          from:    "Badminton District <onboarding@resend.dev>",
          to:      [academyEmail],
          subject: `Booking Rescheduled – ${booking.name}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
              <h2 style="color:#111;">Booking Rescheduled</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
                <tr><td style="padding:6px 0;color:#777;width:100px;">Customer</td><td>${booking.name} (${booking.email})</td></tr>
                <tr><td style="padding:6px 0;color:#777;">From</td><td style="color:#ef4444;"><s>Court ${booking.court_number} · ${fromLabel} · ${formatTime(booking.start_time)}</s></td></tr>
                <tr><td style="padding:6px 0;color:#777;">To</td><td style="font-weight:600;">Court ${newCourtNumber} · ${toLabel} · ${formatTime(newStartTime)}–${formatEndTime(newStartTime)}</td></tr>
                <tr><td style="padding:6px 0;color:#777;">Payment</td><td>Transferred from original booking</td></tr>
              </table>
            </div>
          `,
        })] : []),
      ]);
    }

    return NextResponse.json({
      success:    true,
      newBookingId: newBooking.id,
      newBooking,
    });

  } catch (err) {
    console.error("[REBOOK ERROR]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
