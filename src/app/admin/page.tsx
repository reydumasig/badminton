import { createServerClient } from "@/lib/supabase";
import { fetchBookingsForMonth } from "@/lib/fetchBookingsForMonth";
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
  const [{ data: enrollments }, { data: contacts }, monthBookings] = await Promise.all([
    supabase
      .from("enrollments")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false }),
    fetchBookingsForMonth(supabase, curYear, curMonth),
  ]);

  const bookings = monthBookings;

  return (
    <AdminDashboard
      enrollments={enrollments ?? []}
      contacts={contacts ?? []}
      bookings={bookings}
    />
  );
}
