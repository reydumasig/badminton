"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/supabase-auth-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ─── Constants (mirror booking page) ─────────────────────────
const COURTS = [1, 2, 3, 4, 5];
const TIME_SLOTS: string[] = [];
for (let h = 6; h < 22; h++)
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:00`);

// ─── Helpers ─────────────────────────────────────────────────
function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:00 ${period}`;
}

function formatEndTime(startTime: string) {
  const [h] = startTime.split(":").map(Number);
  return formatTime(`${(h + 1).toString().padStart(2, "0")}:00`);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function maxDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

function isUpcoming(date: string, time: string) {
  return new Date(`${date}T${time}`) > new Date();
}

/** Cancel allowed if > 2 h away */
function canCancel(date: string, time: string) {
  const hoursUntil =
    (new Date(`${date}T${time}`).getTime() - Date.now()) / 3_600_000;
  return hoursUntil > 2;
}

/** Reschedule allowed if > 24 h away */
function canReschedule(date: string, time: string) {
  const hoursUntil =
    (new Date(`${date}T${time}`).getTime() - Date.now()) / 3_600_000;
  return hoursUntil > 24;
}

// ─── Types ────────────────────────────────────────────────────
type Booking = {
  id: string;
  date: string;
  start_time: string;
  court_number: number;
  name: string;
  status: string;
};

type BookedSlot = { court: number; time: string };

// ─── Reschedule Modal ─────────────────────────────────────────
function RescheduleModal({
  booking,
  onClose,
  onRescheduled,
}: {
  booking: Booking;
  onClose: () => void;
  onRescheduled: (updated: Booking) => void;
}) {
  const [newDate, setNewDate] = useState(booking.date);
  const [newCourt, setNewCourt] = useState<number | null>(null);
  const [newTime, setNewTime]   = useState<string | null>(null);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState("");

  // Fetch availability whenever date changes
  useEffect(() => {
    if (!newDate) return;
    setLoadingSlots(true);
    setNewCourt(null);
    setNewTime(null);
    fetch(`/api/bookings/available?date=${newDate}`)
      .then((r) => r.json())
      .then((json) => setBookedSlots(json.booked ?? []))
      .catch(() => setBookedSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [newDate]);

  /**
   * Is this slot already taken?
   * The current booking's own slot is treated as free — it will be released on reschedule.
   */
  const isSlotTaken = (court: number, time: string) => {
    const isCurrent =
      booking.date === newDate &&
      booking.court_number === court &&
      booking.start_time.substring(0, 5) === time;
    if (isCurrent) return false; // will be freed up
    return bookedSlots.some((s) => s.court === court && s.time === time);
  };

  const isPastSlot = (time: string) =>
    new Date(`${newDate}T${time}:00`) <= new Date();

  const isCurrentSlot = (court: number, time: string) =>
    booking.date === newDate &&
    booking.court_number === court &&
    booking.start_time.substring(0, 5) === time;

  const isSelected = (court: number, time: string) =>
    newCourt === court && newTime === time;

  const isSameAsOriginal =
    newDate === booking.date &&
    newCourt === booking.court_number &&
    newTime === booking.start_time.substring(0, 5);

  const handleSelect = (court: number, time: string) => {
    setNewCourt(court);
    setNewTime(time);
    setError("");
  };

  const handleConfirm = async () => {
    if (!newTime || !newCourt || isSameAsOriginal) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/bookings/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          newDate,
          newCourtNumber: newCourt,
          newStartTime: newTime,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Reschedule failed.");
        setSubmitting(false);
        return;
      }
      onRescheduled({
        ...booking,
        date: newDate,
        court_number: newCourt,
        start_time: newTime,
      });
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-semibold">Reschedule Booking</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Currently:{" "}
            <span className="font-medium text-foreground">
              Court {booking.court_number} · {formatDate(booking.date)} ·{" "}
              {formatTime(booking.start_time)}–{formatEndTime(booking.start_time)}
            </span>
          </p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Date picker */}
          <div className="max-w-[200px]">
            <label className="text-sm font-medium">New Date</label>
            <Input
              type="date"
              value={newDate}
              min={todayString()}
              max={maxDateString()}
              onChange={(e) => setNewDate(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-green-100 border border-green-300 dark:bg-green-900" />
              Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-blue-500 border border-blue-600" />
              Selected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-yellow-100 border border-yellow-300 dark:bg-yellow-900" />
              Your current slot
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-muted border border-border" />
              Taken / Past
            </span>
          </div>

          {/* Availability grid */}
          {loadingSlots ? (
            <p className="text-sm text-muted-foreground py-4">Loading availability…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table
                className="w-full text-sm border-collapse"
                style={{ minWidth: `${80 + COURTS.length * 100}px` }}
              >
                <thead className="bg-muted/50">
                  <tr>
                    <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground sticky left-0 bg-muted/50 w-20">
                      Time
                    </th>
                    {COURTS.map((c) => (
                      <th
                        key={c}
                        className="py-2 px-2 text-center text-xs font-semibold min-w-[90px]"
                      >
                        Court {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_SLOTS.map((time, rowIdx) => (
                    <tr
                      key={time}
                      className={`border-t border-border/40 ${
                        rowIdx % 2 === 0 ? "" : "bg-muted/10"
                      }`}
                    >
                      <td className="py-1.5 px-3 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-background font-medium">
                        {formatTime(time)}
                      </td>
                      {COURTS.map((court) => {
                        const taken     = isSlotTaken(court, time);
                        const past      = isPastSlot(time);
                        const current   = isCurrentSlot(court, time);
                        const selected  = isSelected(court, time);
                        const unavailable = taken || past;

                        return (
                          <td key={court} className="py-1.5 px-2 text-center">
                            <button
                              disabled={unavailable}
                              onClick={() =>
                                !unavailable && handleSelect(court, time)
                              }
                              className={`w-full rounded-md py-1.5 px-1 text-xs font-semibold transition-all border ${
                                selected
                                  ? "bg-blue-500 text-white border-blue-600 ring-2 ring-blue-300 dark:ring-blue-700"
                                  : current
                                  ? "bg-yellow-50 text-yellow-900 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-700"
                                  : unavailable
                                  ? "bg-muted text-muted-foreground border-border/30 cursor-not-allowed opacity-40"
                                  : "bg-green-50 text-green-800 border-green-200 hover:bg-green-100 hover:border-green-400 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
                              }`}
                            >
                              {selected
                                ? "✓"
                                : current
                                ? "Current"
                                : taken
                                ? "Taken"
                                : past
                                ? "Past"
                                : "Open"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary */}
          {newTime && newCourt && !isSameAsOriginal && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 p-4 space-y-2">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                Reschedule Summary
              </p>
              <div className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                <div className="flex gap-2">
                  <span className="w-10 shrink-0 text-blue-500 font-medium">From</span>
                  <span>
                    Court {booking.court_number} · {formatDate(booking.date)} ·{" "}
                    {formatTime(booking.start_time)}–
                    {formatEndTime(booking.start_time)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="w-10 shrink-0 text-blue-500 font-medium">To</span>
                  <span>
                    Court {newCourt} · {formatDate(newDate)} ·{" "}
                    {formatTime(newTime)}–{formatEndTime(newTime)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {isSameAsOriginal && newTime && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700 px-3 py-2 rounded-md">
              This is your current slot. Please pick a different time or court.
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md border border-destructive/20">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1"
              disabled={!newTime || !newCourt || isSameAsOriginal || submitting}
              onClick={handleConfirm}
            >
              {submitting ? "Rescheduling…" : "Confirm Reschedule"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Member Portal ────────────────────────────────────────────
export default function MemberPortal({
  user,
  bookings: initialBookings,
}: {
  user: { id: string; email: string };
  bookings: Booking[];
}) {
  const router = useRouter();
  const [bookings, setBookings]   = useState(initialBookings);
  const [cancellingId, setCancellingId]       = useState<string | null>(null);
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const [tab, setTab]             = useState<"upcoming" | "past">("upcoming");
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
        prev.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b))
      );
    }
    setCancellingId(null);
  };

  const handleRescheduled = (updated: Booking) => {
    setBookings((prev) =>
      prev.map((b) => (b.id === updated.id ? updated : b))
    );
    setReschedulingBooking(null);
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

        {/* Booking cards */}
        {displayedBookings.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader className="text-center">
              <CardTitle className="text-base text-muted-foreground">
                {tab === "upcoming" ? "No upcoming bookings" : "No past bookings"}
              </CardTitle>
              {tab === "upcoming" && (
                <CardDescription>
                  <a href="/book" className="underline-offset-2 hover:underline">
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
              const reschedulable =
                b.status === "confirmed" && canReschedule(b.date, b.start_time);
              const cancellable =
                b.status === "confirmed" && canCancel(b.date, b.start_time);
              const showActions = reschedulable || cancellable;

              return (
                <Card
                  key={b.id}
                  className={b.status === "cancelled" ? "opacity-60" : undefined}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          Court {b.court_number}
                        </CardTitle>
                        <CardDescription>
                          {formatDate(b.date)} · {formatTime(b.start_time)}–
                          {formatEndTime(b.start_time)}
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

                  {showActions && (
                    <CardContent className="pt-0 flex flex-wrap gap-2">
                      {reschedulable && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReschedulingBooking(b)}
                        >
                          Reschedule
                        </Button>
                      )}
                      {cancellable && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          disabled={cancellingId === b.id}
                          onClick={() => handleCancel(b.id)}
                        >
                          {cancellingId === b.id ? "Cancelling…" : "Cancel"}
                        </Button>
                      )}
                    </CardContent>
                  )}

                  {/* Hint for bookings within 24h but still cancellable */}
                  {!reschedulable && cancellable && (
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground">
                        Rescheduling unavailable — less than 24 h away.
                      </p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Reschedule Modal */}
      {reschedulingBooking && (
        <RescheduleModal
          booking={reschedulingBooking}
          onClose={() => setReschedulingBooking(null)}
          onRescheduled={handleRescheduled}
        />
      )}
    </div>
  );
}
