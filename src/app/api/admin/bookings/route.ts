import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";

// ── Auth guard ────────────────────────────────────────────────
async function verifyAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;
  return !!(session && adminPassword && session === adminPassword);
}

// ── GET  /api/admin/bookings?date=YYYY-MM-DD ──────────────────
export async function GET(req: NextRequest) {
  if (!(await verifyAdmin()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  const supabase = createServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  // Order DESC so upcoming/future bookings are fetched first — if limit is
  // ever hit, it's better to lose distant-past history than upcoming slots.
  let query = supabase
    .from("bookings")
    .select("*")
    .order("date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(5000);

  if (date) query = query.eq("date", date);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bookings: data ?? [] });
}

// ── POST /api/admin/bookings — create a single booking ────────
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json();
  const { date, startTime, courtNumber, name, email, phone } = body as {
    date: string;
    startTime: string;
    courtNumber: number;
    name: string;
    email?: string;
    phone?: string;
  };

  if (!date || !startTime || !courtNumber || !name) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      date,
      start_time: startTime,
      court_number: courtNumber,
      name,
      email: email || "admin@internal",
      phone: phone || "—",
      status: "confirmed",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return NextResponse.json(
        { error: "That slot is already booked." },
        { status: 409 }
      );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, bookingId: data.id });
}

// ── PUT /api/admin/bookings — update a booking ────────────────
export async function PUT(req: NextRequest) {
  if (!(await verifyAdmin()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json();
  const { id, name, email, phone, status, court_number, date, start_time } =
    body as {
      id: string;
      name?: string;
      email?: string;
      phone?: string;
      status?: string;
      court_number?: number;
      date?: string;
      start_time?: string;
    };

  if (!id)
    return NextResponse.json({ error: "Missing booking ID." }, { status: 400 });

  const supabase = createServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  // Only include fields that were provided
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (phone !== undefined) updates.phone = phone;
  if (status !== undefined) updates.status = status;
  if (court_number !== undefined) updates.court_number = court_number;
  if (date !== undefined) updates.date = date;
  if (start_time !== undefined) updates.start_time = start_time;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });

  // ── Conflict check when slot details are changing ─────
  const isRescheduling = court_number !== undefined || date !== undefined || start_time !== undefined;
  if (isRescheduling) {
    // Fetch the current booking to fill in any unchanged fields
    const { data: current } = await supabase
      .from("bookings")
      .select("date, court_number, start_time")
      .eq("id", id)
      .single();

    if (current) {
      const checkDate       = (date        ?? current.date)        as string;
      const checkCourt      = (court_number ?? current.court_number) as number;
      const checkTime       = (start_time  ?? current.start_time)  as string;

      const { data: conflicts } = await supabase
        .from("bookings")
        .select("id, start_time")
        .eq("date", checkDate)
        .eq("court_number", checkCourt)
        .in("status", ["confirmed", "tentative"])
        .neq("id", id);

      const hasConflict = (conflicts ?? []).some(
        (c) => c.start_time.substring(0, 5) === checkTime.substring(0, 5)
      );

      if (hasConflict)
        return NextResponse.json(
          { error: "That slot is already booked. Please choose another." },
          { status: 409 }
        );
    }
  }

  const { error } = await supabase.from("bookings").update(updates).eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// ── DELETE /api/admin/bookings — hard delete a booking ────────
export async function DELETE(req: NextRequest) {
  if (!(await verifyAdmin()))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await req.json();
  const { id } = body as { id: string };

  if (!id)
    return NextResponse.json({ error: "Missing booking ID." }, { status: 400 });

  const supabase = createServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Database not configured." }, { status: 503 });

  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
