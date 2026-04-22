import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:00 ${period}`;
}

function tomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// Called daily by Vercel Cron — sends reminder emails for tomorrow's bookings
export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const tomorrow = tomorrowDate();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, date, start_time, court_number, name, email")
    .eq("date", tomorrow)
    .eq("status", "confirmed");

  if (error) {
    console.error("[REMINDERS] DB error:", error.message);
    return NextResponse.json({ error: "Failed to fetch bookings." }, { status: 500 });
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0, message: "No bookings tomorrow." });
  }

  const results = await Promise.allSettled(
    bookings.map((b) => {
      const endH = parseInt(b.start_time.split(":")[0], 10) + 1;
      const endTime = endH >= 24 ? "12:00 MN" : `${endH.toString().padStart(2, "0")}:00`;
      const dateDisplay = new Date(b.date + "T00:00:00").toLocaleDateString("en-PH", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });

      return resend.emails.send({
        from: "Badminton District <onboarding@resend.dev>",
        to: [b.email],
        subject: `Reminder: Your court booking is tomorrow`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
            <h2 style="color:#111;">See you tomorrow!</h2>
            <p style="color:#555;">Hi ${b.name}, this is a reminder for your court booking tomorrow.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
              <tr><td style="padding:8px 0;color:#555;width:120px;"><strong>Date</strong></td><td>${dateDisplay}</td></tr>
              <tr><td style="padding:8px 0;color:#555;"><strong>Time</strong></td><td>${formatTime(b.start_time)} – ${endTime === "12:00 MN" ? endTime : formatTime(endTime)}</td></tr>
              <tr><td style="padding:8px 0;color:#555;"><strong>Court</strong></td><td>Court ${b.court_number}</td></tr>
            </table>
            <p style="color:#555;">Please bring proper non-marking indoor badminton shoes. Payment is due at the venue.</p>
            <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
            <p style="font-size:12px;color:#999;">Badminton District · Block 1 Lot 2 Loresville Drive, Lores Farm Subdivision, Barangay San Roque, Antipolo</p>
            <p style="font-size:12px;color:#999;">📱 +63 9272222657</p>
          </div>
        `,
      });
    })
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`[REMINDERS] Sent: ${sent}, Failed: ${failed}`);

  return NextResponse.json({ sent, failed, total: bookings.length });
}
