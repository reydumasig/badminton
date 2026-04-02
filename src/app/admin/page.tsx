import { createServerClient } from "@/lib/supabase";
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

  const [{ data: enrollments }, { data: contacts }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <AdminDashboard
      enrollments={enrollments ?? []}
      contacts={contacts ?? []}
    />
  );
}
