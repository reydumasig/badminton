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

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, startTime, courtNumber, name, email, phone } = body;

    if (!date || !startTime || !courtNumber || !name || !email || !phone) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured." }, { status: 503 });
    }

    // Insert — unique constraint handles double-booking at DB level
    const { data, error } = await supabase
      .from("bookings")
      .insert({
        date,
        start_time: startTime,
        court_number: courtNumber,
        name,
        email,
        phone,
        status: "confirmed",
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique constraint violation — slot already taken
        return NextResponse.json(
          { error: "Sorry, that slot was just booked by someone else. Please choose another." },
          { status: 409 }
        );
      }
      console.error("[BOOKING DB ERROR]", error.message);
      return NextResponse.json({ error: "Failed to save booking." }, { status: 500 });
    }

    const bookingId = data?.id;
    const formattedDate = formatDate(date);
    const formattedStart = formatTime(startTime);
    const [sh, sm] = startTime.split(":").map(Number);
    const endHour = sh + 1;
    const formattedEnd = formatTime(`${endHour.toString().padStart(2, "0")}:${sm.toString().padStart(2, "0")}`);

    // Send emails
    const apiKey = process.env.RESEND_API_KEY;
    const academyEmail = process.env.ACADEMY_EMAIL;

    if (apiKey && academyEmail) {
      const bookingDetails = `
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#555;width:140px;"><strong>Booking ID</strong></td><td style="padding:8px 0;">${bookingId}</td></tr>
          <tr><td style="padding:8px 0;color:#555;"><strong>Date</strong></td><td style="padding:8px 0;">${formattedDate}</td></tr>
          <tr><td style="padding:8px 0;color:#555;"><strong>Time</strong></td><td style="padding:8px 0;">${formattedStart} – ${formattedEnd}</td></tr>
          <tr><td style="padding:8px 0;color:#555;"><strong>Court</strong></td><td style="padding:8px 0;">Court ${courtNumber}</td></tr>
          <tr><td style="padding:8px 0;color:#555;"><strong>Name</strong></td><td style="padding:8px 0;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#555;"><strong>Email</strong></td><td style="padding:8px 0;">${email}</td></tr>
          <tr><td style="padding:8px 0;color:#555;"><strong>Phone</strong></td><td style="padding:8px 0;">${phone}</td></tr>
        </table>
      `;

      await Promise.all([
        // Confirmation to customer
        resend.emails.send({
          from: "Badminton District <onboarding@resend.dev>",
          to: [email],
          subject: `Court Booking Confirmed – ${formattedDate}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
              <h2 style="color:#111;">Your Booking is Confirmed!</h2>
              <p style="color:#555;">Hi ${name}, your court booking at Badminton District has been confirmed. Please settle your payment upon arrival.</p>
              ${bookingDetails}
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
          subject: `New Court Booking – ${name} · ${formattedDate}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
              <h2 style="color:#111;">New Court Booking</h2>
              ${bookingDetails}
              <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
              <p style="font-size:12px;color:#999;">Submitted via badmintonph.com</p>
            </div>
          `,
        }),
      ]);
    }

    return NextResponse.json({ success: true, bookingId });
  } catch (err) {
    console.error("[BOOKING ERROR]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
