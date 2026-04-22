"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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

const COURT_COLORS = ["#3b82f6", "#a855f7", "#f97316", "#22c55e", "#ef4444"];
const QUICK_LABELS = [
  "Admin – Practice",
  "Admin – Blocked",
  "Admin – Maintenance",
  "Admin – Training",
  "Admin – Event",
];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Helpers ─────────────────────────────────────────────────
function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:00 ${period}`;
}

function formatEndTime(startTime: string) {
  const [h] = startTime.split(":").map(Number);
  if (h === 23) return "12:00 MN";
  return formatTime(`${(h + 1).toString().padStart(2, "0")}:00`);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayString() {
  return new Date().toISOString().split("T")[0];
}

// ─── Types ────────────────────────────────────────────────────
type Enrollment = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  program: string;
  status: string;
};

type Contact = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: string;
};

type Booking = {
  id: string;
  created_at: string;
  date: string;
  start_time: string;
  court_number: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  payment_proof_url?: string | null;
};

type ModalState =
  | { mode: "create"; date: string; court: number; time: string }
  | { mode: "edit"; booking: Booking };

type BookingGroup = {
  ids: string[];
  date: string;
  courts: number[];
  start_hour: number;
  end_hour: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  payment_proof_url?: string | null;
  created_at: string;
};

type SortBy = "date-asc" | "date-desc" | "recently-booked" | "name";

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

  const buckets = new Map<string, Booking[]>();
  for (const b of sorted) {
    const key = `${b.name}|||${b.date}|||${b.status}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(b);
  }

  const groups: BookingGroup[] = [];
  for (const slots of buckets.values()) {
    const uniqueHours = [...new Set(slots.map(s => parseInt(s.start_time, 10)))].sort((a, b) => a - b);
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
        ids:               cSlots.map(b => b.id),
        date:              cSlots[0].date,
        courts,
        start_hour:        cluster[0],
        end_hour:          cluster[cluster.length - 1] + 1,
        name:              cSlots[0].name,
        email:             cSlots[0].email,
        phone:             cSlots[0].phone,
        status:            cSlots[0].status,
        payment_proof_url: cSlots.find(b => b.payment_proof_url)?.payment_proof_url ?? null,
        created_at:        cSlots[0].created_at,
      });
    }
  }
  return groups;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  enrolled: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  declined: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  read: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  replied: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  tentative: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  confirmed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  blocked: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

// ─── Booking Modal ────────────────────────────────────────────
function BookingModal({
  modal,
  onClose,
  onSaved,
}: {
  modal: ModalState;
  onClose: () => void;
  onSaved: (booking: Booking, deleted?: boolean) => void;
}) {
  const isEdit = modal.mode === "edit";
  const existing = isEdit ? modal.booking : null;

  const initialCourt = modal.mode === "create" ? modal.court : existing!.court_number;
  const initialDate  = modal.mode === "create" ? modal.date  : existing!.date;
  const initialTime  = modal.mode === "create" ? modal.time  : existing!.start_time.substring(0, 5);

  const [name, setName]   = useState(existing?.name ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [court, setCourt] = useState<number>(initialCourt);
  const [date, setDate]   = useState(initialDate);
  const [time, setTime]   = useState(initialTime);
  const [status, setStatus] = useState(existing?.status ?? "confirmed");
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState("");

  // Proof of payment state (edit mode only)
  const [proofUrl, setProofUrl]         = useState<string | null>(existing?.payment_proof_url ?? null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofSuccess, setProofSuccess] = useState(false);
  const [proofError, setProofError]     = useState("");
  const proofInputRef = useRef<HTMLInputElement>(null);

  const handleProofUpload = async (file: File) => {
    setProofLoading(true);
    setProofError("");
    setProofSuccess(false);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bookingId", existing!.id);
      const res  = await fetch("/api/bookings/proof", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setProofError(json.error || "Upload failed."); return; }
      setProofUrl(json.url);
      setProofSuccess(true);
      setTimeout(() => setProofSuccess(false), 4000);
      // Propagate URL so the table row also refreshes
      onSaved({ ...existing!, payment_proof_url: json.url }, false);
    } catch {
      setProofError("Network error. Please try again.");
    } finally {
      setProofLoading(false);
      if (proofInputRef.current) proofInputRef.current.value = "";
    }
  };

  const handleProofRemove = async () => {
    if (!proofUrl) return;
    setProofLoading(true);
    setProofError("");
    try {
      const res  = await fetch("/api/bookings/proof", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: existing!.id }),
      });
      const json = await res.json();
      if (!res.ok) { setProofError(json.error || "Remove failed."); return; }
      setProofUrl(null);
      onSaved({ ...existing!, payment_proof_url: null }, false);
    } catch {
      setProofError("Network error. Please try again.");
    } finally {
      setProofLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("Name / label is required."); return; }
    setLoading(true);
    setError("");
    try {
      if (isEdit) {
        const res = await fetch("/api/admin/bookings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: existing!.id,
            name: name.trim(),
            email: email || "admin@internal",
            phone: phone || "—",
            court_number: court,
            date,
            start_time: time,
            status,
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Update failed."); setLoading(false); return; }
        onSaved({
          ...existing!,
          name: name.trim(),
          email: email || "admin@internal",
          phone: phone || "—",
          court_number: court,
          date,
          start_time: time,
          status,
        });
      } else {
        const res = await fetch("/api/admin/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            startTime: time,
            courtNumber: court,
            name: name.trim(),
            email: email || "admin@internal",
            phone: phone || "—",
          }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Failed to create booking."); setLoading(false); return; }
        onSaved({
          id: json.bookingId,
          date,
          start_time: time,
          court_number: court,
          name: name.trim(),
          email: email || "admin@internal",
          phone: phone || "—",
          status: "confirmed",
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: existing!.id }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error || "Delete failed.");
        setLoading(false);
        return;
      }
      onSaved(existing!, true);
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="pb-3">
          <CardTitle>{isEdit ? "Edit Booking" : "Add Booking"}</CardTitle>
          <CardDescription>
            {isEdit
              ? "Update details or remove this booking."
              : "Create a new admin booking on the calendar."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick label chips (create only) */}
          {!isEdit && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick label</p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_LABELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setName(l)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      name === l
                        ? "bg-foreground text-background border-foreground"
                        : "border-border hover:border-foreground text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l.replace("Admin – ", "")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-sm font-medium">
              Name / Label <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5"
              placeholder="e.g. Admin – Practice"
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5"
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1.5"
                placeholder="Optional"
              />
            </div>
          </div>

          {/* Court · Date · Time */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Court</label>
              <select
                value={court}
                onChange={(e) => setCourt(Number(e.target.value))}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {COURTS.map((c) => (
                  <option key={c} value={c}>Court {c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Time</label>
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TIME_SLOTS.map((t) => (
                  <option key={t} value={t}>{formatTime(t)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment proof (edit only — admin can upload / replace / remove) */}
          {isEdit && (
            <div>
              <label className="text-sm font-medium">Payment Proof</label>

              {/* Hidden file input */}
              <input
                ref={proofInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleProofUpload(f);
                }}
              />

              {proofUrl ? (
                /* ── Has proof: thumbnail + action bar ── */
                <div className="mt-1.5 rounded-lg border overflow-hidden bg-muted/20">
                  <a href={proofUrl} target="_blank" rel="noopener noreferrer" title="Open full size">
                    <img
                      src={proofUrl}
                      alt="Payment proof"
                      className="w-full max-h-52 object-contain bg-black/5 hover:opacity-90 transition-opacity"
                    />
                  </a>
                  <div className="flex items-center justify-between px-3 py-2 border-t bg-background flex-wrap gap-y-1">
                    <span className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
                      {proofSuccess ? "✓ Uploaded successfully!" : "✓ Proof on file"}
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <a
                        href={proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline underline-offset-2"
                      >
                        View ↗
                      </a>
                      <button
                        type="button"
                        disabled={proofLoading}
                        onClick={() => proofInputRef.current?.click()}
                        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        disabled={proofLoading}
                        onClick={handleProofRemove}
                        className="text-destructive hover:text-destructive/80 transition-colors disabled:opacity-40"
                      >
                        {proofLoading ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── No proof: dashed upload zone ── */
                <button
                  type="button"
                  disabled={proofLoading}
                  onClick={() => proofInputRef.current?.click()}
                  className="mt-1.5 w-full border-2 border-dashed rounded-lg px-4 py-5 flex flex-col items-center gap-1.5 text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-40"
                >
                  {proofLoading ? (
                    <span className="text-xs">Uploading…</span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                      <span className="text-xs font-medium">Upload proof of payment</span>
                      <span className="text-[11px] opacity-70">JPG, PNG, WEBP, GIF, HEIC · max 5 MB</span>
                    </>
                  )}
                </button>
              )}

              {proofSuccess && !proofUrl && (
                <p className="mt-1.5 text-xs text-green-700 dark:text-green-400">✓ Proof uploaded successfully!</p>
              )}
              {proofError && (
                <p className="mt-1.5 text-xs text-destructive">{proofError}</p>
              )}
            </div>
          )}

          {/* Status (edit only) */}
          {isEdit && (
            <div>
              <label className="text-sm font-medium">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="tentative">Tentative</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
          )}

          {error && (
            <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              {loading ? "Saving…" : isEdit ? "Save Changes" : "Add Booking"}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={loading} type="button">
              Cancel
            </Button>
          </div>

          {isEdit && (
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleDelete}
              disabled={loading}
              type="button"
            >
              {deleteConfirm ? "⚠️ Confirm — this cannot be undone" : "Delete Booking"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Admin Calendar ───────────────────────────────────────────
function AdminCalendar({
  bookings,
  setBookings,
}: {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
}) {
  const today = todayString();
  const now   = new Date();

  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [modal, setModal] = useState<ModalState | null>(null);

  // ── Calendar grid maths ──────────────────────────────────
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth     = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells      = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;

  // Group bookings per date (active only, for the dot indicators)
  const bookingsByDate = bookings.reduce<Record<string, Booking[]>>((acc, b) => {
    if (b.status !== "cancelled") {
      (acc[b.date] ??= []).push(b);
    }
    return acc;
  }, {});

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };
  const goToToday = () => {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
    setSelectedDate(today);
  };

  const selectDay = (day: number) => {
    const d = `${viewYear}-${(viewMonth + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    setSelectedDate(d);
  };

  // ── Day schedule helpers ─────────────────────────────────
  const dayBookings = bookings.filter(
    (b) => b.date === selectedDate && b.status !== "cancelled"
  );

  const getSlotBooking = (court: number, time: string) =>
    dayBookings.find(
      (b) =>
        b.court_number === court &&
        b.start_time.substring(0, 5) === time
    );

  // ── Modal handlers ───────────────────────────────────────
  const handleCellClick = (court: number, time: string) => {
    const existing = getSlotBooking(court, time);
    setModal(
      existing
        ? { mode: "edit", booking: existing }
        : { mode: "create", date: selectedDate, court, time }
    );
  };

  const handleModalSaved = (saved: Booking, deleted?: boolean) => {
    if (deleted) {
      setBookings((prev) => prev.filter((b) => b.id !== saved.id));
    } else if (modal?.mode === "edit") {
      setBookings((prev) => prev.map((b) => (b.id === saved.id ? saved : b)));
    } else {
      setBookings((prev) => [...prev, saved]);
    }
    setModal(null);
  };

  const selectedDateLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString(
    "en-PH",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" }
  );

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr] items-start">
        {/* ── Month grid ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </CardTitle>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="sm" onClick={prevMonth} className="h-7 w-7 p-0 text-base">‹</Button>
                <Button variant="ghost" size="sm" onClick={goToToday} className="h-7 text-xs px-2">Today</Button>
                <Button variant="ghost" size="sm" onClick={nextMonth} className="h-7 w-7 p-0 text-base">›</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {/* Day name row */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: totalCells }).map((_, idx) => {
                const day = idx - firstDayOfMonth + 1;
                const inMonth = day >= 1 && day <= daysInMonth;
                if (!inMonth) return <div key={idx} />;

                const dateStr = `${viewYear}-${(viewMonth + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
                const dayBkgs = bookingsByDate[dateStr] ?? [];
                const isToday    = dateStr === today;
                const isSelected = dateStr === selectedDate;
                const bookedCourts = [...new Set(dayBkgs.map((b) => b.court_number))].sort();

                return (
                  <button
                    key={idx}
                    onClick={() => selectDay(day)}
                    className={`rounded-lg flex flex-col items-center justify-start py-1.5 px-0.5 transition-colors min-h-[46px] ${
                      isSelected
                        ? "bg-foreground text-background"
                        : isToday
                        ? "bg-accent ring-1 ring-accent-foreground/30"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <span
                      className={`text-xs font-semibold leading-none ${
                        isSelected ? "text-background" : isToday ? "text-accent-foreground" : ""
                      }`}
                    >
                      {day}
                    </span>
                    {bookedCourts.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-[2px] mt-1">
                        {bookedCourts.slice(0, 5).map((c) => (
                          <span
                            key={c}
                            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: COURT_COLORS[c - 1] ?? "#888" }}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Court colour legend */}
            <div className="mt-4 pt-3 border-t flex flex-wrap gap-x-3 gap-y-1.5">
              {COURTS.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                    style={{ backgroundColor: COURT_COLORS[c - 1] }}
                  />
                  Court {c}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Day schedule ────────────────────────────────── */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base">{selectedDateLabel}</CardTitle>
                <CardDescription className="mt-0.5">
                  {dayBookings.length > 0
                    ? `${dayBookings.length} booking${dayBookings.length > 1 ? "s" : ""} · click any slot to add or edit`
                    : "No bookings · click any slot to add one"}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setModal({ mode: "create", date: selectedDate, court: 1, time: "08:00" })
                }
              >
                + Add Booking
              </Button>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table
              className="w-full text-sm border-collapse"
              style={{ minWidth: `${80 + COURTS.length * 120}px` }}
            >
              <thead>
                <tr className="bg-muted/40 border-b">
                  <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground w-20 sticky left-0 bg-muted/40">
                    Time
                  </th>
                  {COURTS.map((c) => (
                    <th key={c} className="py-2.5 px-3 text-center text-xs font-semibold min-w-[120px]">
                      <span className="flex items-center justify-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: COURT_COLORS[c - 1] }}
                        />
                        Court {c}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((time, rowIdx) => {
                  const isPastSlot =
                    new Date(`${selectedDate}T${time}:00`) <= new Date();

                  return (
                    <tr
                      key={time}
                      className={`border-t border-border/40 ${
                        rowIdx % 2 === 0 ? "" : "bg-muted/10"
                      }`}
                    >
                      {/* Time label */}
                      <td
                        className={`py-1.5 px-4 text-xs whitespace-nowrap sticky left-0 bg-background font-medium ${
                          isPastSlot ? "text-muted-foreground/50" : "text-muted-foreground"
                        }`}
                      >
                        {formatTime(time)}
                      </td>

                      {COURTS.map((court) => {
                        const booking = getSlotBooking(court, time);
                        const isAdminBooking = booking?.name.startsWith("Admin");

                        if (booking) {
                          return (
                            <td key={court} className="py-1.5 px-2">
                              <button
                                onClick={() => handleCellClick(court, time)}
                                className={`w-full rounded-md py-2 px-2.5 text-left transition-all hover:opacity-70 border ${
                                  isAdminBooking
                                    ? "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800"
                                    : "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/60 dark:text-blue-100 dark:border-blue-800"
                                }`}
                                title={`${booking.name}\n${booking.email}\n${booking.phone}`}
                              >
                                <p className="text-xs font-semibold truncate leading-tight max-w-[100px]">
                                  {booking.name}
                                </p>
                                <p className="text-[10px] opacity-60 mt-0.5">
                                  {formatTime(time)}–{formatEndTime(time)}
                                </p>
                              </button>
                            </td>
                          );
                        }

                        return (
                          <td key={court} className="py-1.5 px-2">
                            <button
                              onClick={() => handleCellClick(court, time)}
                              className={`w-full rounded-md py-2 px-2 text-xs transition-all border group ${
                                isPastSlot
                                  ? "opacity-20 cursor-default border-transparent"
                                  : "border-dashed border-border/60 hover:border-foreground/50 hover:bg-muted/40 text-transparent hover:text-muted-foreground"
                              }`}
                            >
                              {isPastSlot ? "·" : "+"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Booking Modal */}
      {modal && (
        <BookingModal
          modal={modal}
          onClose={() => setModal(null)}
          onSaved={handleModalSaved}
        />
      )}
    </>
  );
}

// ─── Main AdminDashboard ──────────────────────────────────────
export default function AdminDashboard({
  enrollments,
  contacts,
  bookings: initialBookings,
}: {
  enrollments: Enrollment[];
  contacts: Contact[];
  bookings: Booking[];
}) {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [tab, setTab] = useState<"calendar" | "bookings" | "enrollments" | "contacts">(
    "calendar"
  );
  const [loggingOut, setLoggingOut] = useState(false);
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("date-asc");

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  const activeBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "tentative");

  const TABS: Array<{ key: typeof tab; label: string }> = [
    { key: "calendar",    label: "📅 Calendar" },
    { key: "bookings",    label: `Bookings (${activeBookings.length})` },
    { key: "enrollments", label: `Enrollments (${enrollments.length})` },
    { key: "contacts",    label: `Inquiries (${contacts.length})` },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Admin</p>
            <h1 className="text-lg font-semibold tracking-tight">Dizer Badminton Academy</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Signing out…" : "Sign Out"}
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10 space-y-6">
        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Bookings</CardDescription>
              <CardTitle className="text-3xl">{activeBookings.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Registrations</CardDescription>
              <CardTitle className="text-3xl">{enrollments.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>New Registrations</CardDescription>
              <CardTitle className="text-3xl">
                {enrollments.filter((e) => e.status === "new").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unread Inquiries</CardDescription>
              <CardTitle className="text-3xl">
                {contacts.filter((c) => c.status === "new").length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Calendar tab ──────────────────────────────── */}
        {tab === "calendar" && (
          <AdminCalendar bookings={bookings} setBookings={setBookings} />
        )}

        {/* ── Bookings table ────────────────────────────── */}
        {tab === "bookings" && (() => {
          const groups = groupBookings(activeBookings);
          const sorted = [...groups].sort((a, b) => {
            switch (sortBy) {
              case "date-asc":        return a.date !== b.date ? a.date.localeCompare(b.date) : a.start_hour - b.start_hour;
              case "date-desc":       return a.date !== b.date ? b.date.localeCompare(a.date) : a.start_hour - b.start_hour;
              case "recently-booked": return b.created_at.localeCompare(a.created_at);
              case "name":            return a.name.localeCompare(b.name);
              default:                return 0;
            }
          });

          return (
            <Card>
              {/* Sort controls */}
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <p className="text-sm text-muted-foreground">
                  {sorted.length} booking{sorted.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Sort by</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="date-asc">Date (soonest first)</option>
                    <option value="date-desc">Date (latest first)</option>
                    <option value="recently-booked">Recently Booked</option>
                    <option value="name">Name (A–Z)</option>
                  </select>
                </div>
              </div>

              <CardContent className="p-0">
                {sorted.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No bookings yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {["Date", "Time", "Courts", "Name", "Email", "Phone", "Proof", "Status"].map((h) => (
                            <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((g, i) => (
                          <tr
                            key={g.ids.join("-")}
                            className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                          >
                            <td className="px-4 py-3 whitespace-nowrap">
                              {new Date(g.date + "T00:00:00").toLocaleDateString("en-PH", {
                                month: "short", day: "numeric", year: "numeric",
                              })}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs">
                              {formatGroupTime(g.start_hour, g.end_hour)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 font-medium text-xs">
                                {g.courts.map((c) => (
                                  <span key={c} className="flex items-center gap-1">
                                    <span
                                      className="w-2 h-2 rounded-full inline-block"
                                      style={{ backgroundColor: COURT_COLORS[c - 1] ?? "#888" }}
                                    />
                                  </span>
                                ))}
                                {formatCourts(g.courts)}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-medium">{g.name}</td>
                            <td className="px-4 py-3">
                              <a href={`mailto:${g.email}`} className="text-primary underline-offset-2 hover:underline">
                                {g.email}
                              </a>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{g.phone}</td>
                            <td className="px-4 py-3">
                              {g.payment_proof_url ? (
                                <a
                                  href={g.payment_proof_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 font-medium"
                                >
                                  <span className="text-green-600">✓</span> View ↗
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[g.status] ?? ""}`}>
                                {g.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* ── Enrollments table ─────────────────────────── */}
        {tab === "enrollments" && (
          <Card>
            <CardContent className="p-0">
              {enrollments.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No registrations yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {["Date","Name","Email","Program","Status"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map((e, i) => (
                        <tr key={e.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(e.created_at)}
                          </td>
                          <td className="px-4 py-3 font-medium">{e.name}</td>
                          <td className="px-4 py-3">
                            <a href={`mailto:${e.email}`} className="text-primary underline-offset-2 hover:underline">{e.email}</a>
                          </td>
                          <td className="px-4 py-3">{e.program}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[e.status] ?? ""}`}>
                              {e.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Contacts table ────────────────────────────── */}
        {tab === "contacts" && (
          <Card>
            <CardContent className="p-0">
              {contacts.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No inquiries yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {["Date","Name","Email","Phone","Message","Status"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c, i) => (
                        <tr key={c.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(c.created_at)}
                          </td>
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3">
                            <a href={`mailto:${c.email}`} className="text-primary underline-offset-2 hover:underline">{c.email}</a>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                          <td className="px-4 py-3 max-w-xs">
                            <button
                              onClick={() =>
                                setExpandedContact(expandedContact === c.id ? null : c.id)
                              }
                              className="text-left"
                            >
                              {expandedContact === c.id ? (
                                <span className="whitespace-pre-wrap">{c.message}</span>
                              ) : (
                                <span className="line-clamp-2 text-muted-foreground">{c.message}</span>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[c.status] ?? ""}`}>
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
