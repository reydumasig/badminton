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
// Group-level helpers
function groupIsUpcoming(g: { date: string; start_hour: number }) {
  return isUpcoming(g.date, `${g.start_hour.toString().padStart(2, "0")}:00`);
}
function groupCanCancel(g: { date: string; start_hour: number }) {
  return canCancel(g.date, `${g.start_hour.toString().padStart(2, "0")}:00:00`);
}
function groupCanReschedule(g: { date: string; start_hour: number }) {
  return canReschedule(g.date, `${g.start_hour.toString().padStart(2, "0")}:00:00`);
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

// A group of consecutive slots (same user, same date, adjacent or simultaneous courts/hours)
type BookingGroup = {
  ids: string[];
  date: string;
  courts: number[];
  start_hour: number;
  end_hour: number;
  name: string;
  status: string;
  payment_proof_url?: string | null;
  firstBooking: Booking; // used for reschedule modal (single-slot groups only)
};

// ─── Group helpers ────────────────────────────────────────────
function formatCourts(courts: number[]): string {
  const s = [...courts].sort((a, b) => a - b);
  if (s.length === 1) return `Court ${s[0]}`;
  if (s.length === 2) return `Courts ${s[0]} & ${s[1]}`;
  return `Courts ${s.slice(0, -1).join(", ")} & ${s[s.length - 1]}`;
}

function formatGroupTime(startHour: number, endHour: number): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const start = formatTime(`${pad(startHour)}:00`);
  const end   = endHour >= 24 ? "12:00 MN" : formatTime(`${pad(endHour)}:00`);
  const hrs   = endHour - startHour;
  return `${start} – ${end} · ${hrs} hr${hrs > 1 ? "s" : ""}`;
}

function groupBookings(bookings: Booking[]): BookingGroup[] {
  if (bookings.length === 0) return [];

  const sorted = [...bookings].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.start_time !== b.start_time) return a.start_time.localeCompare(b.start_time);
    return a.court_number - b.court_number;
  });

  // Bucket by (name, date, status) — then cluster into consecutive-hour groups
  const buckets = new Map<string, Booking[]>();
  for (const b of sorted) {
    const key = `${b.name}|||${b.date}|||${b.status}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(b);
  }

  const groups: BookingGroup[] = [];

  for (const slots of buckets.values()) {
    const uniqueHours = [...new Set(slots.map(s => parseInt(s.start_time, 10)))].sort((a, b) => a - b);

    // Split into consecutive hour clusters
    const clusters: number[][] = [];
    let cur = [uniqueHours[0]];
    for (let i = 1; i < uniqueHours.length; i++) {
      uniqueHours[i] === uniqueHours[i - 1] + 1 ? cur.push(uniqueHours[i]) : (clusters.push(cur), cur = [uniqueHours[i]]);
    }
    clusters.push(cur);

    for (const cluster of clusters) {
      const cSlots = slots.filter(s => cluster.includes(parseInt(s.start_time, 10)));
      const courts = [...new Set(cSlots.map(b => b.court_number))].sort((a, b) => a - b);
      groups.push({
        ids:              cSlots.map(b => b.id),
        date:             cSlots[0].date,
        courts,
        start_hour:       cluster[0],
        end_hour:         cluster[cluster.length - 1] + 1,
        name:             cSlots[0].name,
        status:           cSlots[0].status,
        payment_proof_url: cSlots.find(b => b.payment_proof_url)?.payment_proof_url ?? null,
        firstBooking:     cSlots[0],
      });
    }
  }

  return groups.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : a.start_hour - b.start_hour);
}

// ─── Reschedule Modal ─────────────────────────────────────────
function RescheduleModal({
  booking,
  onClose,
  onRescheduled,
}: {
  booking: Booking;
  onClose: () => void;
  onRescheduled: (newBooking: Booking, oldBookingId: string) => void;
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
      if (!res.ok) { setError(json.error || "Rebook failed."); setSubmitting(false); return; }
      onRescheduled(json.newBooking, booking.id);
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
          <h2 className="text-lg font-semibold">Rebook Slot</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Moving from:{" "}
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
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Rebook Summary</p>
              {[
                ["From", `Court ${booking.court_number} · ${formatDate(booking.date)} · ${formatTime(booking.start_time)}–${formatEndTime(booking.start_time)}`],
                ["To",   `Court ${newCourt} · ${formatDate(newDate)} · ${formatTime(newTime)}–${formatEndTime(newTime)}`],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-2 text-xs text-blue-800 dark:text-blue-200">
                  <span className="w-9 shrink-0 font-semibold text-blue-500">{label}</span>
                  <span>{val}</span>
                </div>
              ))}
              <p className="text-xs text-blue-700 dark:text-blue-300 pt-1 border-t border-blue-200 dark:border-blue-700">
                ✅ Your payment will be transferred to the new slot. No additional payment required.
              </p>
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
              {submitting ? "Rebooking…" : "Confirm Rebook"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Proof Upload Section ─────────────────────────────────────
function ProofUpload({ bookingIds, initialProofUrl }: { bookingIds: string[]; initialProofUrl?: string | null }) {
  const [proofUrl,     setProofUrl]     = useState<string | null>(initialProofUrl ?? null);
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

    try {
      // Upload to first booking ID to get the URL
      const fd = new FormData();
      fd.append("file",      file);
      fd.append("bookingId", bookingIds[0]);
      const res  = await fetch("/api/bookings/proof", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Upload failed."); return; }
      setProofUrl(json.url);
      triggerSuccessFlash();
      // Upload same file to remaining IDs (prevents auto-cancel on all slots)
      for (const id of bookingIds.slice(1)) {
        const fd2 = new FormData();
        fd2.append("file",      file);
        fd2.append("bookingId", id);
        await fetch("/api/bookings/proof", { method: "POST", body: fd2 });
      }
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
      // Remove proof from all booking IDs in the group
      for (const id of bookingIds) {
        await fetch("/api/bookings/proof", {
          method:  "DELETE",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ bookingId: id }),
        });
      }
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

// ─── Booking Group Card ───────────────────────────────────────
function BookingCard({
  group,
  onCancel,
  onReschedule,
  cancellingIds,
}: {
  group: BookingGroup;
  onCancel: (ids: string[]) => void;
  onReschedule: (b: Booking) => void;
  cancellingIds: string[];
}) {
  // Reschedule only available for single-slot groups (1 court, 1 hour)
  const isSingleSlot  = group.ids.length === 1;
  const startTime     = `${group.start_hour.toString().padStart(2, "0")}:00`;
  const reschedulable = isSingleSlot && group.status === "confirmed" && groupCanReschedule(group);
  const cancellable   = (group.status === "confirmed" || group.status === "tentative") && groupCanCancel(group);
  const isActive      = group.status === "confirmed" || group.status === "tentative";
  const isCancelling  = group.ids.some(id => cancellingIds.includes(id));

  const statusBadge = {
    confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    tentative: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    blocked:   "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  }[group.status] ?? "bg-muted text-muted-foreground";

  return (
    <Card className={group.status === "cancelled" ? "opacity-60" : undefined}>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{formatCourts(group.courts)}</CardTitle>
            <CardDescription>
              {formatDate(group.date)} · {formatGroupTime(group.start_hour, group.end_hour)}
            </CardDescription>
          </div>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${statusBadge}`}>
            {group.status === "tentative" ? "⏳ Tentative" : group.status}
          </span>
        </div>
      </CardHeader>

      {/* Tentative warning banner */}
      {group.status === "tentative" && (
        <CardContent className="pt-0 pb-2">
          <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-700 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            ⚠️ <strong>Payment required within 1 hour</strong> — upload your proof of payment below or this slot will be automatically cancelled.
          </div>
        </CardContent>
      )}

      {/* Proof of payment section (active bookings) */}
      {isActive && (
        <ProofUpload
          bookingIds={group.ids}
          initialProofUrl={group.payment_proof_url}
        />
      )}

      {/* Reschedule / Cancel actions */}
      {(reschedulable || cancellable) && (
        <CardContent className="pt-0 flex flex-wrap gap-2 pb-4">
          {reschedulable && (
            <Button variant="outline" size="sm" onClick={() => onReschedule(group.firstBooking)}>
              Rebook
            </Button>
          )}
          {cancellable && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={isCancelling}
              onClick={() => onCancel(group.ids)}
            >
              {isCancelling ? "Cancelling…" : "Cancel"}
            </Button>
          )}
        </CardContent>
      )}

      {/* Hint when within 24h but still cancellable */}
      {isSingleSlot && !reschedulable && cancellable && (
        <CardContent className="pt-0 pb-3">
          <p className="text-xs text-muted-foreground">
            Rebooking unavailable — less than 24 h before slot.
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
  const [cancellingIds, setCancellingIds] = useState<string[]>([]);
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const [tab,         setTab]         = useState<"upcoming" | "past">("upcoming");
  const [loggingOut,  setLoggingOut]  = useState(false);

  const upcoming = bookings.filter(
    (b) => (b.status === "confirmed" || b.status === "tentative") && isUpcoming(b.date, b.start_time)
  );
  const past = bookings.filter(
    (b) => !(b.status === "confirmed" || b.status === "tentative") || !isUpcoming(b.date, b.start_time)
  );

  const upcomingGroups = groupBookings(upcoming);
  const pastGroups     = groupBookings(past);

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createAuthBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleCancel = async (ids: string[]) => {
    const label = ids.length > 1 ? `all ${ids.length} slots in this booking` : "this booking";
    if (!confirm(`Are you sure you want to cancel ${label}?`)) return;
    setCancellingIds(ids);
    await Promise.all(
      ids.map((id) =>
        fetch("/api/bookings/cancel", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ bookingId: id }),
        })
      )
    );
    setBookings((prev) => prev.map((b) => ids.includes(b.id) ? { ...b, status: "cancelled" } : b));
    setCancellingIds([]);
  };

  const handleRescheduled = (newBooking: Booking, oldBookingId: string) => {
    setBookings((prev) => [
      // Mark the original as cancelled in local state (slot freed)
      ...prev.map((b) => b.id === oldBookingId ? { ...b, status: "cancelled" } : b),
      // Add the new booking
      newBooking,
    ]);
    setReschedulingBooking(null);
  };

  const displayedGroups = tab === "upcoming" ? upcomingGroups : pastGroups;

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
          <Card><CardHeader className="pb-2"><CardDescription>Upcoming</CardDescription><CardTitle className="text-3xl">{upcomingGroups.length}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Total Bookings</CardDescription><CardTitle className="text-3xl">{bookings.filter((b) => b.status === "confirmed").length}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Past Sessions</CardDescription><CardTitle className="text-3xl">{pastGroups.length}</CardTitle></CardHeader></Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b">
          {(["upcoming", "past"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t === "upcoming" ? `Upcoming (${upcomingGroups.length})` : `Past (${pastGroups.length})`}
            </button>
          ))}
        </div>

        {/* Booking group cards */}
        {displayedGroups.length === 0 ? (
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
            {displayedGroups.map((g) => (
              <BookingCard
                key={g.ids.join("-")}
                group={g}
                onCancel={handleCancel}
                onReschedule={setReschedulingBooking}
                cancellingIds={cancellingIds}
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
