import { createServerClient } from "@/lib/supabase";
import { bookingMonthRangeISO, BOOKINGS_MONTH_LIMIT } from "@/lib/bookingMonthRange";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!session || !adminPassword || session !== adminPassword) {
    redirect("/admin/login");
  }

  const supabase = createServerClient();

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Supabase is not configured.</p>
      </div>
    );
  }

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const { start: monthStart, end: monthEnd } = bookingMonthRangeISO(curYear, curMonth);

  const [{ data: enrollments }, { data: contacts }, { data: monthBookings }, { data: globalBookings }] =
    await Promise.all([
      supabase
        .from("enrollments")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("bookings")
        .select("*")
        .gte("date", monthStart)
        .lte("date", monthEnd)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(BOOKINGS_MONTH_LIMIT),
      supabase
        .from("bookings")
        .select("*")
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .limit(200_000),
    ]);

  const bookingMap = new Map<string, NonNullable<typeof globalBookings>[number]>();
  for (const row of globalBookings ?? []) bookingMap.set(row.id, row);
  for (const row of monthBookings ?? []) bookingMap.set(row.id, row);
  const bookings = Array.from(bookingMap.values());

  return (
    <AdminDashboard
      enrollments={enrollments ?? []}
      contacts={contacts ?? []}
      bookings={bookings}
    />
  );
}
