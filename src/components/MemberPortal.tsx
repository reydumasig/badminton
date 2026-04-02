"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/supabase-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Booking = {
  id: string;
  date: string;
  start_time: string;
  court_number: number;
  name: string;
  status: string;
};

function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:00 ${period}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isUpcoming(date: string, time: string) {
  return new Date(`${date}T${time}`) > new Date();
}

function canCancel(date: string, time: string) {
  const slot = new Date(`${date}T${time}`);
  const now = new Date();
  const hoursUntil = (slot.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursUntil > 2;
}

export default function MemberPortal({
  user,
  bookings: initialBookings,
}: {
  user: { id: string; email: string };
  bookings: Booking[];
}) {
  const router = useRouter();
  const [bookings, setBookings] = useState(initialBookings);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [loggingOut, setLoggingOut] = useState(false);

  const upcoming = bookings.filter(
    (b) => b.status === "confirmed" && isUpcoming(b.date, b.start_time)
  );
  const past = bookings.filter(
    (b) => b.status !== "confirmed" || !isUpcoming(b.date, b.start_time)
  );

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createAuthBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleCancel = async (bookingId: string) => {
    if (!confirm("Are you sure you want to cancel this booking?")) return;
    setCancellingId(bookingId);

    const res = await fetch("/api/bookings/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });

    if (res.ok) {
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId ? { ...b, status: "cancelled" } : b
        )
      );
    }
    setCancellingId(null);
  };

  const displayedBookings = tab === "upcoming" ? upcoming : past;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Member Portal
            </p>
            <h1 className="text-lg font-semibold tracking-tight">
              Badminton District
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild size="sm">
              <a href="/book">Book a Court</a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? "Signing out…" : "Sign Out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
        {/* Welcome */}
        <div>
          <h2 className="text-xl font-semibold">My Bookings</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Upcoming</CardDescription>
              <CardTitle className="text-3xl">{upcoming.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Bookings</CardDescription>
              <CardTitle className="text-3xl">
                {bookings.filter((b) => b.status === "confirmed").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Past Sessions</CardDescription>
              <CardTitle className="text-3xl">{past.length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b">
          {(["upcoming", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "upcoming"
                ? `Upcoming (${upcoming.length})`
                : `Past (${past.length})`}
            </button>
          ))}
        </div>

        {/* Bookings list */}
        {displayedBookings.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader className="text-center">
              <CardTitle className="text-base text-muted-foreground">
                {tab === "upcoming"
                  ? "No upcoming bookings"
                  : "No past bookings"}
              </CardTitle>
              {tab === "upcoming" && (
                <CardDescription>
                  <a
                    href="/book"
                    className="underline-offset-2 hover:underline"
                  >
                    Book a court
                  </a>{" "}
                  to get started.
                </CardDescription>
              )}
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {displayedBookings.map((b) => {
              const endH = parseInt(b.start_time) + 1;
              const endTime = `${endH.toString().padStart(2, "0")}:00`;
              const cancellable =
                b.status === "confirmed" && canCancel(b.date, b.start_time);

              return (
                <Card
                  key={b.id}
                  className={
                    b.status === "cancelled" ? "opacity-60" : undefined
                  }
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          Court {b.court_number}
                        </CardTitle>
                        <CardDescription>
                          {formatDate(b.date)} · {formatTime(b.start_time)}–
                          {formatTime(endTime)}
                        </CardDescription>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
                          b.status === "confirmed"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>
                  </CardHeader>
                  {cancellable && (
                    <CardContent className="pt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        disabled={cancellingId === b.id}
                        onClick={() => handleCancel(b.id)}
                      >
                        {cancellingId === b.id ? "Cancelling…" : "Cancel Booking"}
                      </Button>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
