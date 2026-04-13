import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { createAuthServerClient } from "@/lib/supabase-auth-server";

const BUCKET       = "payment-proofs";
const MAX_SIZE_MB  = 5;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"];

// ── Admin check (mirrors /api/admin/bookings) ─────────────────
async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const session     = cookieStore.get("admin_session")?.value;
  const adminPw     = process.env.ADMIN_PASSWORD;
  if (!adminPw || !session) return false;
  return session === adminPw;
}

// ── Helper: extract storage path from public URL ───────────────
function extractStoragePath(url: string): string | null {
  try {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx    = url.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(url.substring(idx + marker.length));
  } catch {
    return null;
  }
}

// ── POST /api/bookings/proof — upload a proof image ────────────
export async function POST(req: NextRequest) {
  try {
    const adminOk = await isAdmin();

    // Auth: admin OR logged-in member
    let userId: string | null = null;
    if (!adminOk) {
      const supabaseAuth = await createAuthServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
      userId = user.id;
    }

    // Parse multipart form data
    const formData  = await req.formData();
    const file      = formData.get("file")      as File   | null;
    const bookingId = formData.get("bookingId") as string | null;

    if (!file || !bookingId) {
      return NextResponse.json({ error: "Missing file or booking ID." }, { status: 400 });
    }

    // Validate type
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json(
        { error: "Only image files (JPG, PNG, WEBP, GIF, HEIC) are allowed." },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `File must be under ${MAX_SIZE_MB} MB.` },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

    // Fetch booking
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, user_id, payment_proof_url, status")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    // Members: must own the booking and it can't be cancelled
    if (!adminOk) {
      if (booking.user_id !== userId) return NextResponse.json({ error: "Unauthorised." }, { status: 403 });
      if (booking.status === "cancelled") {
        return NextResponse.json({ error: "Cannot upload proof for a cancelled booking." }, { status: 400 });
      }
    }

    // Remove old file if one already exists
    if (booking.payment_proof_url) {
      const oldPath = extractStoragePath(booking.payment_proof_url);
      if (oldPath) {
        await supabase.storage.from(BUCKET).remove([oldPath]);
      }
    }

    // Build storage path and upload
    const ext    = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path   = `${bookingId}/${Date.now()}-proof.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error("[PROOF UPLOAD ERROR]", uploadError.message);
      return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    }

    // Build public URL and persist to booking row
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(uploadData.path);

    const { error: updateError } = await supabase
      .from("bookings")
      .update({ payment_proof_url: publicUrl })
      .eq("id", bookingId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to save proof URL." }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err) {
    console.error("[PROOF ERROR]", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

// ── DELETE /api/bookings/proof — remove a proof image ─────────
export async function DELETE(req: NextRequest) {
  try {
    const adminOk = await isAdmin();

    // Auth: admin OR logged-in member
    let userId: string | null = null;
    if (!adminOk) {
      const supabaseAuth = await createAuthServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
      userId = user.id;
    }

    const { bookingId } = (await req.json()) as { bookingId: string };
    if (!bookingId) return NextResponse.json({ error: "Missing booking ID." }, { status: 400 });

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "Database not configured." }, { status: 503 });

    // Fetch booking
    const { data: booking, error: fetchError } = await supabase
      .from("bookings")
      .select("id, user_id, payment_proof_url")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    // Members: must own the booking
    if (!adminOk && booking.user_id !== userId) {
      return NextResponse.json({ error: "Unauthorised." }, { status: 403 });
    }

    // Delete from storage
    if (booking.payment_proof_url) {
      const path = extractStoragePath(booking.payment_proof_url);
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]);
      }
    }

    // Clear URL from booking
    await supabase
      .from("bookings")
      .update({ payment_proof_url: null })
      .eq("id", bookingId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[PROOF DELETE ERROR]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
