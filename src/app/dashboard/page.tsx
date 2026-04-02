import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase-auth";
import { createServerClient } from "@/lib/supabase";
import MemberPortal from "@/components/MemberPortal";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "My Bookings – Badminton District",
};

export default async function DashboardPage() {
  const supabaseAuth = await createAuthServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch this user's bookings using the service role client
  const supabase = createServerClient();
  const { data: bookings } = supabase
    ? await supabase
        .from("bookings")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
    : { data: [] };

  return <MemberPortal user={{ id: user.id, email: user.email ?? "" }} bookings={bookings ?? []} />;
}
