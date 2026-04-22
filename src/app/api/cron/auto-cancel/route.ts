import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createServerClient } from "@/lib/supabase";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * GET /api/cron/auto-cancel
 *
 * Runs every 15 minutes via Vercel Cron (Pro plan).
 *
 * Atomically cancels all tentative bookings older than 1 hour with no
 * proof of payment uploaded, then sends one cancellation email per
 * affected customer listing every slot that was released.
 *
 * The update query doubles as an atomic lock: only rows still in
 * "tentative" status are touched, so concurrent runs (e.g. this cron
 * overlapping with the availability-check cleanup) can never double-send.
 *
 * Protected by CRON_SECRET env var (set in Vercel project settings).
 */

type CancelledBooking = {
  id: string;
  name: string;
  email: string;
  date: string;
  start_time: string;
  court_number: number;
};

function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:00 ${period}`;
}

function formatEndTime(t: string) {
  const [h] = t.split(":").map(Number);
  const next = h + 1;
  if (next >= 24) return "12:00 MN";
  return formatTime(`${next.toString().padStart(2, "0")}:00`);
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildCancellationEmail(name: string, slots: CancelledBooking[]): string {
  const slotRows = slots
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
    .map(
      (s) => `
      <tr style="border-bottom:1px solid #f5f5f5;">
        <td style="padding:8px 12px 8px 0;color:#333;">${formatDate(s.date)}</td>
        <td style="padding:8px 12px 8px 0;color:#333;">Court ${s.court_number}</td>
        <td style="padding:8px 0;color:#333;">${formatTime(s.start_time)} – ${formatEndTime(s.start_time)}</td>
      </tr>`
    )
    .join("");

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="color:#dc2626;">❌ Your Booking Was Cancelled</h2>
      <p style="color:#555;">
        Hi ${name}, the following slot${slots.length > 1 ? "s were" : " was"} automatically
        released because payment was not received within the <strong>1-hour deadline</strong>.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
        <thead>
          <tr style="border-bottom:2px solid #eee;">
            <th style="padding:8px 12px 8px 0;text-align:left;color:#555;">Date</th>
            <th style="padding:8px 12px 8px 0;text-align:left;color:#555;">Court</th>
            <th style="padding:8px 0;text-align:left;color:#555;">Time</th>
          </tr>
        </thead>
        <tbody>${slotRows}</tbody>
      </table>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-top:16px;font-size:13px;color:#991b1b;">
        <strong>Why was it cancelled?</strong><br/>
        Slots are held for up to <strong>1 hour</strong> after booking. If payment proof is not
        uploaded within that window, the slot is automatically released so other players can book it.
      </div>

      <p style="margin-top:20px;color:#555;font-size:14px;">
        Want to rebook? Slots may still be available —
        <a href="https://www.badmintonph.com/book" style="color:#2563eb;">book again here</a>.
      </p>

      <hr style="margin:24px 0;border:none;border-top:1px solid #eee;"/>
      <p style="font-size:12px;color:#999;">Badminton District · Block 1 Lot 2 Loresville Drive, Lores Farm Subdivision, Barangay San Roque, Antipolo</p>
      <p style="font-size:12px;color:#999;">📱 +63 9272222657</p>
    </div>
  `;
}

export async function GET(req: NextRequest) {
  // Verify this is a legitimate Vercel Cron call
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });
  }

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Atomic update: only rows still "tentative" are touched.
  // The .select() returns exactly what was cancelled — prevents double-processing
  // if this cron overlaps with the availability-check cleanup.
  const { data: cancelled, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("status", "tentative")
    .is("payment_proof_url", null)
    .lt("created_at", cutoff)
    .select("id, name, email, date, start_time, court_number");

  if (error) {
    console.error("[AUTO-CANCEL] DB error:", error.message);
    return NextResponse.json({ error: "Failed to cancel bookings." }, { status: 500 });
  }

  if (!cancelled || cancelled.length === 0) {
    return NextResponse.json({ cancelled: 0, message: "No expired bookings." });
  }

  console.log(`[AUTO-CANCEL] Cancelled ${cancelled.length} expired booking(s):`, cancelled.map((b) => b.id));

  // Group by email so each customer gets one email listing all their cancelled slots
  const byEmail = new Map<string, CancelledBooking[]>();
  for (const b of cancelled as CancelledBooking[]) {
    if (!byEmail.has(b.email)) byEmail.set(b.email, []);
    byEmail.get(b.email)!.push(b);
  }

  // Send cancellation emails (fire-and-forget — don't fail the cron if email fails)
  const apiKey  = process.env.RESEND_API_KEY;
  const results: Array<{ email: string; slots: number; sent: boolean }> = [];

  if (apiKey) {
    await Promise.allSettled(
      Array.from(byEmail.entries()).map(async ([email, slots]) => {
        const name = slots[0].name;
        try {
          await resend.emails.send({
            from: "Badminton District <onboarding@resend.dev>",
            to: [email],
            subject: `Booking Cancelled – Payment Not Received · ${slots.length > 1 ? `${slots.length} slots` : formatDate(slots[0].date)}`,
            html: buildCancellationEmail(name, slots),
          });
          results.push({ email, slots: slots.length, sent: true });
          console.log(`[AUTO-CANCEL] Cancellation email sent → ${email} (${slots.length} slot(s))`);
        } catch (err) {
          results.push({ email, slots: slots.length, sent: false });
          console.error(`[AUTO-CANCEL] Failed to send email to ${email}:`, err);
        }
      })
    );
  }

  return NextResponse.json({
    cancelled: cancelled.length,
    emails_sent: results.filter((r) => r.sent).length,
    details: results,
  });
}
