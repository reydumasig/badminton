import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, phone, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const apiKey = process.env.RESEND_API_KEY;
    const academyEmail = process.env.ACADEMY_EMAIL;

    if (apiKey && academyEmail) {
      await resend.emails.send({
        from: "Dizer Badminton Academy <onboarding@resend.dev>",
        to: [academyEmail],
        subject: `New Inquiry – ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
            <h2 style="color: #111;">New Contact Inquiry</h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0; color: #555; width: 140px;"><strong>Name</strong></td>
                <td style="padding: 8px 0;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #555;"><strong>Email</strong></td>
                <td style="padding: 8px 0;"><a href="mailto:${email}">${email}</a></td>
              </tr>
              ${
                phone
                  ? `<tr>
                <td style="padding: 8px 0; color: #555;"><strong>Phone</strong></td>
                <td style="padding: 8px 0;">${phone}</td>
              </tr>`
                  : ""
              }
              <tr>
                <td style="padding: 8px 0; color: #555; vertical-align: top;"><strong>Message</strong></td>
                <td style="padding: 8px 0; white-space: pre-wrap;">${message}</td>
              </tr>
            </table>
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #999;">Submitted via dizerbadmintonacademy.com</p>
          </div>
        `,
      });
    } else {
      // Log to console in dev when email is not configured
      console.log("[CONTACT SUBMISSION]", { name, email, phone, message });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[CONTACT ERROR]", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
