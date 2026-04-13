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
      status: "confirmed",
      ...(userId ? { user_id: userId } : {}),
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
    const PRICE_PER_SLOT = 200;
    const total = slots.length * PRICE_PER_SLOT;

    // Build the slots table for emails
    const slotRows = slots
      .slice()
      .sort((a, b) => a.courtNumber - b.courtNumber || a.startTime.localeCompare(b.startTime))
      .map(
        (s) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:8px 12px 8px 0;color:#333;">Court ${s.courtNumber}</td>
          <td style="padding:8px 12px 8px 0;color:#333;">${formatTime(s.startTime)} – ${formatEndTime(s.startTime)}</td>
          <td style="padding:8px 0;color:#333;text-align:right;">₱${PRICE_PER_SLOT}</td>
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
          subject: `Court Booking${slots.length > 1 ? "s" : ""} Confirmed – ${formattedDate}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
              <h2 style="color:#111;">Your Booking${slots.length > 1 ? "s are" : " is"} Confirmed! ✓</h2>
              <p style="color:#555;">Hi ${name}, your court booking${slots.length > 1 ? "s" : ""} at Badminton District ${slots.length > 1 ? "have" : "has"} been confirmed. Please settle payment upon arrival.</p>
              ${bookingTable}
              <div style="background:#f0fdf4;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:13px;color:#166534;">
                💳 Payment is due at the venue. Please bring this confirmation.
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
