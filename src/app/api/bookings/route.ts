import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function formatEndTime(startTime: string) {
  const [h] = startTime.split(":").map(Number);
  return formatTime(`${(h + 1).toString().padStart(2, "0")}:00`);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

type SlotInput = { courtNumber: number; startTime: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, slots, name, email, phone, userId } = body as {
      date: string;
      slots: SlotInput[];
      name: string;
      email: string;
      phone: string;
      userId?: string;
    };

    if (!userId) {
      return NextResponse.json(
        { error: "You must be signed in to make a booking." },
        { status: 401 }
      );
    }

    if (
      !date ||
      !Array.isArray(slots) ||
      slots.length === 0 ||
      !name ||
      !email ||
      !phone
    ) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured." },
        { status: 503 }
      );
    }

    // Build rows for batch insert
    const rows = slots.map((s) => ({
      date,
      start_time: s.startTime,
      court_number: s.courtNumber,
      name,
      email,
      phone,
      status: "tentative",
      user_id: userId,
    }));

    const { data, error } = await supabase
      .from("bookings")
      .insert(rows)
      .select("id");

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "One or more of your selected slots was just booked by someone else. Please go back and adjust your selection.",
          },
          { status: 409 }
        );
      }
      console.error("[BOOKING DB ERROR]", error.message);
      return NextResponse.json(
        { error: "Failed to save bookings." },
        { status: 500 }
      );
    }

    const bookingIds = (data ?? []).map((d) => d.id as string);
    const formattedDate = formatDate(date);

    // Per-court pricing: Court 1 & 2 → ₱320/hr, Court 3 → ₱300/hr
    const courtPrice = (courtNumber: number) => courtNumber === 3 ? 300 : 320;
    const total = slots.reduce((sum, s) => sum + courtPrice(s.courtNumber), 0);

    // Payment policy: weekday = 50% min, weekend/holiday = full
    const dayOfWeek  = new Date(date + "T00:00:00").getDay();
    const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;
    const amountDue  = isWeekend ? total : Math.ceil(total * 0.5);
    const paymentNote = isWeekend
      ? `Full payment of ₱${total.toLocaleString()} is required (weekend/holiday rate).`
      : `Minimum 50% down payment of ₱${amountDue.toLocaleString()} is required now. Remaining ₱${(total - amountDue).toLocaleString()} due at venue.`;

    // Build the slots table for emails
    const slotRows = slots
      .slice()
      .sort((a, b) => a.courtNumber - b.courtNumber || a.startTime.localeCompare(b.startTime))
      .map(
        (s) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 12px 8px 0;color:#333;">Court ${s.courtNumber}</td>
          <td style="padding:8px 12px 8px 0;color:#333;">${formatTime(s.startTime)} – ${formatEndTime(s.startTime)}</td>
          <td style="padding:8px 0;color:#333;text-align:right;">₱${courtPrice(s.courtNumber)}</td>
        </tr>`
      )
      .join("");

    const bookingTable = `
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr><td style="padding:6px 0;color:#777;width:120px;">Date</td><td style="padding:6px 0;font-weight:600;">${formattedDate}</td></tr>
        <tr><td style="padding:6px 0;color:#777;">Name</td><td style="padding:6px 0;">${name}</td></tr>
        <tr><td style="padding:6px 0;color:#777;">Email</td><td style="padding:6px 0;">${email}</td></tr>
        <tr><td style="padding:6px 0;color:#777;">Phone</td><td style="padding:6px 0;">${phone}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="border-bottom:2px solid #eee;">
            <th style="padding:8px 12px 8px 0;text-align:left;color:#555;">Court</th>
            <th style="padding:8px 12px 8px 0;text-align:left;color:#555;">Time</th>
            <th style="padding:8px 0;text-align:right;color:#555;">Price</th>
          </tr>
        </thead>
        <tbody>${slotRows}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #eee;">
            <td colspan="2" style="padding:10px 0;font-weight:700;font-size:15px;">Total (${slots.length} slot${slots.length > 1 ? "s" : ""})</td>
            <td style="padding:10px 0;font-weight:700;font-size:15px;text-align:right;">₱${total.toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
    `;

    const apiKey = process.env.RESEND_API_KEY;
    const academyEmail = process.env.ACADEMY_EMAIL;

    if (apiKey && academyEmail) {
      await Promise.all([
        // Confirmation to customer
        resend.emails.send({
          from: "Badminton District <onboarding@resend.dev>",
          to: [email],
          subject: `Slot Reserved – Payment Required · ${formattedDate}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
              <h2 style="color:#92400e;">⏳ Your Slot is Tentatively Reserved</h2>
              <p style="color:#555;">Hi ${name}, your slot at Badminton District has been reserved but is <strong>pending payment</strong>. Please complete payment within <strong>1 hour</strong> or your slot will be automatically released.</p>
              ${bookingTable}
              <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:13px;color:#92400e;">
                <strong>💳 Payment Required:</strong> ${paymentNote}<br/><br/>
                <strong>⚠️ Deadline:</strong> Within 1 hour of this booking.<br/><br/>
                Pay via <strong>RCBC InstaPay</strong> (Grace Dizer · ****9527) or <strong>GCash</strong> (0927 222 ····), then upload your proof of payment at:<br/>
                <a href="https://www.badmintonph.com/dashboard" style="color:#d97706;">badmintonph.com/dashboard</a>
              </div>
              <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
              <p style="font-size:12px;color:#999;">Badminton District · Block 1 Lot 2 Loresville Drive, Lores Farm Subdivision, Barangay San Roque, Antipolo</p>
              <p style="font-size:12px;color:#999;">📱 +63 9272222657</p>
            </div>
          `,
        }),
        // Notification to academy
        resend.emails.send({
          from: "Badminton District <onboarding@resend.dev>",
          to: [academyEmail],
          subject: `New Booking${slots.length > 1 ? "s" : ""} – ${name} · ${formattedDate}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
              <h2 style="color:#111;">New Court Booking${slots.length > 1 ? "s" : ""}</h2>
              ${bookingTable}
              <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
              <p style="font-size:12px;color:#999;">Submitted via badmintonph.com</p>
            </div>
          `,
        }),
      ]);
    }

    return NextResponse.json({ success: true, bookingIds });
  } catch (err) {
    console.error("[BOOKING ERROR]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
