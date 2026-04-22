"use client";

import { useState, useEffect, useRef } from "react";
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

// ─── Constants ────────────────────────────────────────────────
const COURTS = [1, 2, 3];
const TIME_SLOTS: string[] = [];
for (let h = 9; h < 24; h++)
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:00`);

// ─── Helpers ─────────────────────────────────────────────────
function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour   = h % 12 || 12;
  return `${hour}:00 ${period}`;
}

function formatEndTime(startTime: string) {
  const [h] = startTime.split(":").map(Number);
  if (h === 23) return "12:00 MN";
  return formatTime(`${(h + 1).toString().padStart(2, "0")}:00`);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month:   "short",
    day:     "numeric",
    year:    "numeric",
  });
}

function todayString()  { return new Date().toISOString().split("T")[0]; }
function maxDateString() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().split("T")[0];
}

function isUpcoming(date: string, time: string) {
  return new Date(`${date}T${time}`) > new Date();
}
function canCancel(date: string, time: string) {
  return (new Date(`${date}T${time}`).getTime() - Date.now()) / 3_600_000 > 2;
}
function canReschedule(date: string, time: string) {
  return (new Date(`${date}T${time}`).getTime() - Date.now()) / 3_600_000 > 24;
}

// ─── Types ────────────────────────────────────────────────────
type Booking = {
  id: string;
  date: string;
  start_time: string;
  court_number: number;
  name: string;
  status: string;
  payment_proof_url?: string | null;
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
  const [newDate,      setNewDate]      = useState(booking.date);
  const [newCourt,     setNewCourt]     = useState<number | null>(null);
  const [newTime,      setNewTime]      = useState<string | null>(null);
  const [bookedSlots,  setBookedSlots]  = useState<BookedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState("");

  useEffect(() => {
    if (!newDate) return;
    setLoadingSlots(true);
    setNewCourt(null);
    setNewTime(null);
    fetch(`/api/bookings/available?date=${newDate}`)
      .then((r) => r.json())
      .then((j) => setBookedSlots(j.booked ?? []))
      .catch(() => setBookedSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [newDate]);

  const isSlotTaken = (court: number, time: string) => {
    const isCurrent =
      booking.date === newDate &&
      booking.court_number === court &&
      booking.start_time.substring(0, 5) === time;
    if (isCurrent) return false;
    return bookedSlots.some((s) => s.court === court && s.time === time);
  };
  const isPastSlot     = (time: string) => new Date(`${newDate}T${time}:00`) <= new Date();
  const isCurrentSlot  = (court: number, time: string) =>
    booking.date === newDate &&
    booking.court_number === court &&
    booking.start_time.substring(0, 5) === time;
  const isSelectedSlot = (court: number, time: string) =>
    newCourt === court && newTime === time;
  const isSameAsOriginal =
    newDate === booking.date &&
    newCourt === booking.court_number &&
    newTime  === booking.start_time.substring(0, 5);

  const handleConfirm = async () => {
    if (!newTime || !newCourt || isSameAsOriginal) return;
    setSubmitting(true);
    setError("");
    try {
      const res  = await fetch("/api/bookings/reschedule", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ bookingId: booking.id, newDate, newCourtNumber: newCourt, newStartTime: newTime }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Reschedule failed."); setSubmitting(false); return; }
      onRescheduled({ ...booking, date: newDate, court_number: newCourt, start_time: newTime });
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
          <div className="max-w-[200px]">
            <label className="text-sm font-medium">New Date</label>
            <Input type="date" value={newDate} min={todayString()} max={maxDateString()}
              onChange={(e) => setNewDate(e.target.value)} className="mt-1.5" />
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            {[
              ["bg-green-100 border-green-300 dark:bg-green-900","Available"],
              ["bg-blue-500 border-blue-600","Selected"],
              ["bg-yellow-100 border-yellow-300 dark:bg-yellow-900","Your current slot"],
              ["bg-muted border-border","Taken / Past"],
            ].map(([cls, label]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-3 w-3 rounded-sm ${cls} border`} />{label}
              </span>
            ))}
          </div>

          {loadingSlots ? (
            <p className="text-sm text-muted-foreground py-4">Loading availability…</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm border-collapse" style={{ minWidth: `${80 + COURTS.length * 100}px` }}>
                <thead className="bg-muted/50">
                  <tr>
                    <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground sticky left-0 bg-muted/50 w-20">Time</th>
                    {COURTS.map((c) => (
                      <th key={c} className="py-2 px-2 text-center text-xs font-semibold min-w-[90px]">Court {c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_SLOTS.map((time, rowIdx) => (
                    <tr key={time} className={`border-t border-border/40 ${rowIdx % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="py-1.5 px-3 text-xs text-muted-foreground whitespace-nowrap sticky left-0 bg-background font-medium">
                        {formatTime(time)}
                      </td>
                      {COURTS.map((court) => {
                        const taken     = isSlotTaken(court, time);
                        const past      = isPastSlot(time);
                        const current   = isCurrentSlot(court, time);
                        const selected  = isSelectedSlot(court, time);
                        const disabled  = taken || past;
                        return (
                          <td key={court} className="py-1.5 px-2 text-center">
                            <button
                              disabled={disabled}
                              onClick={() => !disabled && (setNewCourt(court), setNewTime(time), setError(""))}
                              className={`w-full rounded-md py-1.5 px-1 text-xs font-semibold transition-all border ${
                                selected   ? "bg-blue-500 text-white border-blue-600 ring-2 ring-blue-300 dark:ring-blue-700"
                                : current  ? "bg-yellow-50 text-yellow-900 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200"
                                : disabled ? "bg-muted text-muted-foreground border-border/30 cursor-not-allowed opacity-40"
                                           : "bg-green-50 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:text-green-200"
                              }`}
                            >
                              {selected ? "✓" : current ? "Current" : taken ? "Taken" : past ? "Past" : "Open"}
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

          {newTime && newCourt && !isSameAsOriginal && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 p-4 space-y-1.5">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Reschedule Summary</p>
              {[
                ["From", `Court ${booking.court_number} · ${formatDate(booking.date)} · ${formatTime(booking.start_time)}–${formatEndTime(booking.start_time)}`],
                ["To",   `Court ${newCourt} · ${formatDate(newDate)} · ${formatTime(newTime)}–${formatEndTime(newTime)}`],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-2 text-xs text-blue-800 dark:text-blue-200">
                  <span className="w-9 shrink-0 font-semibold text-blue-500">{label}</span>
                  <span>{val}</span>
                </div>
              ))}
            </div>
          )}

          {isSameAsOriginal && newTime && (
            <p className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 px-3 py-2 rounded-md">
              This is your current slot. Pick a different time or court.
            </p>
          )}
          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md border border-destructive/20">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" disabled={!newTime || !newCourt || isSameAsOriginal || submitting} onClick={handleConfirm}>
              {submitting ? "Rescheduling…" : "Confirm Reschedule"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Proof Upload Section ─────────────────────────────────────
function ProofUpload({ booking }: { booking: Booking }) {
  const [proofUrl,     setProofUrl]     = useState<string | null>(booking.payment_proof_url ?? null);
  const [uploading,    setUploading]    = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [successFlash, setSuccessFlash] = useState(false);
  const [error,        setError]        = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const triggerSuccessFlash = () => {
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), 4000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-selected

    if (file.size > 5 * 1024 * 1024) {
      setError("File must be under 5 MB.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file",      file);
    formData.append("bookingId", booking.id);

    try {
      const res  = await fetch("/api/bookings/proof", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Upload failed."); return; }
      setProofUrl(json.url);
      triggerSuccessFlash();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/bookings/proof", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ bookingId: booking.id }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Delete failed."); return; }
      setProofUrl(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="pt-0 pb-4 px-6 space-y-2">
      {/* Section label */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Proof of Payment
      </p>

      {/* Success flash */}
      {successFlash && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-800 px-3 py-2">
          <span className="text-green-600 dark:text-green-400 text-base leading-none">✓</span>
          <p className="text-xs font-medium text-green-800 dark:text-green-200">
            Proof uploaded successfully!
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {/* Uploading state */}
      {uploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          Uploading…
        </div>
      )}

      {/* Proof exists */}
      {!uploading && proofUrl && (
        <div className="rounded-lg border overflow-hidden bg-muted/30">
          {/* Image preview */}
          <a href={proofUrl} target="_blank" rel="noopener noreferrer" title="Click to view full size">
            <img
              src={proofUrl}
              alt="Payment proof"
              className="w-full max-h-40 object-contain bg-black/5 hover:opacity-90 transition-opacity"
            />
          </a>
          {/* Action bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-background border-t">
            <span className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
              <span>✓</span> Proof submitted
            </span>
            <div className="flex items-center gap-2">
              <a
                href={proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline underline-offset-2"
              >
                View ↗
              </a>
              <span className="text-border">·</span>
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Replace
              </button>
              <span className="text-border">·</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* No proof yet */}
      {!uploading && !proofUrl && (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border hover:border-foreground/40 hover:bg-muted/30 transition-colors py-3 text-sm text-muted-foreground hover:text-foreground"
        >
          {/* Camera icon */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Upload proof of payment
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

// ─── Booking Card ─────────────────────────────────────────────
function BookingCard({
  booking,
  onCancel,
  onReschedule,
  cancellingId,
}: {
  booking: Booking;
  onCancel: (id: string) => void;
  onReschedule: (b: Booking) => void;
  cancellingId: string | null;
}) {
  const reschedulable = booking.status === "confirmed" && canReschedule(booking.date, booking.start_time);
  const cancellable   = booking.status === "confirmed" && canCancel(booking.date, booking.start_time);
  const isConfirmed   = booking.status === "confirmed";

  return (
    <Card className={booking.status === "cancelled" ? "opacity-60" : undefined}>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Court {booking.court_number}</CardTitle>
            <CardDescription>
              {formatDate(booking.date)} · {formatTime(booking.start_time)}–{formatEndTime(booking.start_time)}
            </CardDescription>
          </div>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${
            booking.status === "confirmed"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-muted text-muted-foreground"
          }`}>
            {booking.status}
          </span>
        </div>
      </CardHeader>

      {/* Proof of payment section (confirmed bookings only) */}
      {isConfirmed && <ProofUpload booking={booking} />}

      {/* Reschedule / Cancel actions */}
      {(reschedulable || cancellable) && (
        <CardContent className="pt-0 flex flex-wrap gap-2 pb-4">
          {reschedulable && (
            <Button variant="outline" size="sm" onClick={() => onReschedule(booking)}>
              Reschedule
            </Button>
          )}
          {cancellable && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={cancellingId === booking.id}
              onClick={() => onCancel(booking.id)}
            >
              {cancellingId === booking.id ? "Cancelling…" : "Cancel"}
            </Button>
          )}
        </CardContent>
      )}

      {/* Hint when within 24h but still cancellable */}
      {!reschedulable && cancellable && (
        <CardContent className="pt-0 pb-3">
          <p className="text-xs text-muted-foreground">
            Rescheduling unavailable — less than 24 h away.
          </p>
        </CardContent>
      )}
    </Card>
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
  const router  = useRouter();
  const [bookings,    setBookings]    = useState(initialBookings);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const [tab,         setTab]         = useState<"upcoming" | "past">("upcoming");
  const [loggingOut,  setLoggingOut]  = useState(false);

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
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ bookingId }),
    });
    if (res.ok) {
      setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, status: "cancelled" } : b));
    }
    setCancellingId(null);
  };

  const handleRescheduled = (updated: Booking) => {
    setBookings((prev) => prev.map((b) => b.id === updated.id ? updated : b));
    setReschedulingBooking(null);
  };

  const displayedBookings = tab === "upcoming" ? upcoming : past;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Member Portal</p>
            <h1 className="text-lg font-semibold tracking-tight">Badminton District</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild size="sm"><a href="/book">Book a Court</a></Button>
            <Button variant="outline" size="sm" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? "Signing out…" : "Sign Out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
        <div>
          <h2 className="text-xl font-semibold">My Bookings</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardDescription>Upcoming</CardDescription><CardTitle className="text-3xl">{upcoming.length}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Total Bookings</CardDescription><CardTitle className="text-3xl">{bookings.filter((b) => b.status === "confirmed").length}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Past Sessions</CardDescription><CardTitle className="text-3xl">{past.length}</CardTitle></CardHeader></Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b">
          {(["upcoming", "past"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t === "upcoming" ? `Upcoming (${upcoming.length})` : `Past (${past.length})`}
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
                  <a href="/book" className="underline-offset-2 hover:underline">Book a court</a> to get started.
                </CardDescription>
              )}
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {displayedBookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={handleCancel}
                onReschedule={setReschedulingBooking}
                cancellingId={cancellingId}
              />
            ))}
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
