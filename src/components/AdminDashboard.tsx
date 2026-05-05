"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

function formatSpanEndTime(startTime: string, span: number): string {
  const [h] = startTime.split(":").map(Number);
  const endH = h + span;
  if (endH >= 24) return "12:00 MN";
  return formatTime(`${endH.toString().padStart(2, "0")}:00`);
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

// ─── Calendar coverage map ────────────────────────────────────
type CalendarEntry = { booking: Booking; span: number } | "skip";

function buildCalendarCoverage(dayBookings: Booking[]): Map<string, CalendarEntry> {
  const map = new Map<string, CalendarEntry>();
  for (const court of COURTS) {
    const slots = dayBookings
      .filter((b) => b.court_number === court)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    let i = 0;
    while (i < slots.length) {
      const first = slots[i];
      const startH = parseInt(first.start_time, 10);
      let span = 1;
      while (
        i + span < slots.length &&
        slots[i + span].name === first.name &&
        parseInt(slots[i + span].start_time, 10) === startH + span
      ) span++;
      const key = `${court}:${first.start_time.substring(0, 5)}`;
      map.set(key, { booking: first, span });
      for (let s = 1; s < span; s++) {
        const skipKey = `${court}:${(startH + s).toString().padStart(2, "0")}:00`;
        map.set(skipKey, "skip");
      }
      i += span;
    }
  }
  return map;
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

          {/* Booking timestamp (edit mode only) */}
          {isEdit && existing?.created_at && (
            <div className="flex items-center gap-2 rounded-md bg-muted/50 border border-border/50 px-3 py-2.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground shrink-0">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <div className="text-xs text-muted-foreground leading-none">
                <span className="font-medium text-foreground">Booked at:</span>{" "}
                {new Date(existing.created_at).toLocaleString("en-PH", {
                  month: "short", day: "numeric", year: "numeric",
                  hour: "numeric", minute: "2-digit", hour12: true,
                })}
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
  const [refreshing, setRefreshing] = useState(false);

  // ── Hydration-safe "now" ─────────────────────────────────
  // new Date() in the render loop causes React hydration error #418 because
  // the server renders at time T and the client hydrates at T+Xms — some
  // isPastSlot values flip between the two renders, producing mismatched HTML.
  // Solution: start at 0 (all slots "not past" on server), then update
  // client-side after mount so server and client agree on the initial render.
  const [clientNow, setClientNow] = useState<number>(0);
  useEffect(() => {
    setClientNow(Date.now());
    const id = setInterval(() => setClientNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Live data refresh ────────────────────────────────────
  const refreshBookings = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({
        year: String(viewYear),
        month: String(viewMonth + 1),
      });
      const res  = await fetch(`/api/admin/bookings?${params}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.bookings)) {
        // MERGE — never replace existing bookings with a potentially
        // incomplete API result. Update status/fields for bookings the
        // API returned, and add any brand-new ones. Bookings already in
        // state that the API didn't return (e.g. outside the query window)
        // are preserved as-is so they never disappear from the calendar.
        setBookings(prev => {
          const map = new Map(prev.map(b => [b.id, b]));
          for (const b of json.bookings as Booking[]) {
            map.set(b.id, b);
          }
          return Array.from(map.values());
        });
      }
    } catch { /* silently ignore network errors — preserves existing state */ } finally {
      setRefreshing(false);
    }
  }, [setBookings, viewYear, viewMonth]);

  // Refresh whenever the admin navigates to a different month
  useEffect(() => {
    refreshBookings();
  }, [viewMonth, viewYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh every 30 seconds so stale user bookings appear
  useEffect(() => {
    const id = setInterval(refreshBookings, 30_000);
    return () => clearInterval(id);
  }, [refreshBookings]);

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
  // Active (non-cancelled) bookings for the selected day — used for coverage map + rowspan
  const dayBookings = bookings.filter(
    (b) => b.date === selectedDate && b.status !== "cancelled"
  );
  // Cancelled bookings shown as a separate indicator so admin can see what happened
  const dayCancelledBookings = bookings.filter(
    (b) => b.date === selectedDate && b.status === "cancelled"
  );

  // Fast lookup maps
  const getSlotBooking = (court: number, time: string) =>
    dayBookings.find(
      (b) => b.court_number === court && b.start_time.substring(0, 5) === time
    );
  const getCancelledSlotBooking = (court: number, time: string) =>
    dayCancelledBookings.find(
      (b) => b.court_number === court && b.start_time.substring(0, 5) === time
    );

  // ── Modal handlers ───────────────────────────────────────
  const handleCellClick = (court: number, time: string) => {
    // Let admin click into cancelled slots to restore/edit them
    const existing = getSlotBooking(court, time) ?? getCancelledSlotBooking(court, time);
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

  const calendarCoverage = buildCalendarCoverage(dayBookings);

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
              <div className="flex items-center gap-2">
                <button
                  onClick={refreshBookings}
                  disabled={refreshing}
                  title="Refresh bookings"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={refreshing ? "animate-spin" : ""}
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                  </svg>
                </button>
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
                  // clientNow is 0 during SSR → isPastSlot = false for all slots
                  // → server and client agree → no React #418 hydration error
                  const isPastSlot = clientNow > 0
                    && new Date(`${selectedDate}T${time}:00`).getTime() <= clientNow;

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
                        const coverageKey = `${court}:${time}`;
                        const entry = calendarCoverage.get(coverageKey);

                        // This slot is part of a span started in a previous row — skip td
                        if (entry === "skip") return null;

                        // This slot starts a grouped (or single) booking
                        if (entry && typeof entry === "object") {
                          const { booking, span } = entry;
                          const isAdminBooking = booking.name.startsWith("Admin");
                          return (
                            <td
                              key={court}
                              rowSpan={span}
                              className="px-2 align-top"
                              style={{ paddingTop: "6px", paddingBottom: "6px" }}
                            >
                              <button
                                onClick={() => handleCellClick(court, time)}
                                className={`w-full h-full rounded-md py-2 px-2.5 text-left transition-all hover:opacity-70 border ${
                                  isAdminBooking
                                    ? "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800"
                                    : "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/60 dark:text-blue-100 dark:border-blue-800"
                                }`}
                                title={`${booking.name}\n${booking.email}\n${booking.phone}`}
                                style={{ minHeight: `${span * 40 - 8}px` }}
                              >
                                <p className="text-xs font-semibold truncate leading-tight max-w-[100px]">
                                  {booking.name}
                                </p>
                                <p className="text-[10px] opacity-60 mt-0.5">
                                  {formatTime(time)}–{formatSpanEndTime(time, span)}
                                </p>
                                {span > 1 && (
                                  <p className="text-[10px] opacity-50 mt-0.5">
                                    {span} hr{span > 1 ? "s" : ""}
                                  </p>
                                )}
                              </button>
                            </td>
                          );
                        }

                        // Cancelled slot — show a visible indicator so admin can see what happened
                        const cancelledBooking = getCancelledSlotBooking(court, time);
                        if (cancelledBooking) {
                          return (
                            <td key={court} className="py-1.5 px-2">
                              <button
                                onClick={() => handleCellClick(court, time)}
                                className="w-full rounded-md py-2 px-2.5 text-left transition-all hover:opacity-80 border border-red-200/60 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900/40"
                                title={`Cancelled: ${cancelledBooking.name}\n${cancelledBooking.email}`}
                              >
                                <p className="text-[10px] font-medium line-through text-red-400 dark:text-red-600 truncate leading-tight max-w-[100px]">
                                  {cancelledBooking.name}
                                </p>
                                <p className="text-[9px] text-red-400/70 dark:text-red-600/70 mt-0.5">
                                  Cancelled
                                </p>
                              </button>
                            </td>
                          );
                        }

                        // Empty slot
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

// ─── Sales / Revenue Dashboard ───────────────────────────────
type RevPeriod = "day" | "week" | "month" | "quarter" | "year" | "custom";

function courtRevenue(b: Booking): number {
  return b.court_number === 3 ? 300 : 320;
}

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getPeriodRange(period: Exclude<RevPeriod, "custom">): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const MS = 86400000;

  switch (period) {
    case "day": return {
      start: today,
      end: today,
      prevStart: new Date(today.getTime() - MS),
      prevEnd: new Date(today.getTime() - MS),
    };
    case "week": {
      const dow = today.getDay();
      const mon = new Date(today.getTime() - (dow === 0 ? 6 : dow - 1) * MS);
      const sun = new Date(mon.getTime() + 6 * MS);
      return {
        start: mon, end: sun,
        prevStart: new Date(mon.getTime() - 7 * MS),
        prevEnd: new Date(mon.getTime() - MS),
      };
    }
    case "month": return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      prevStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      prevEnd: new Date(now.getFullYear(), now.getMonth(), 0),
    };
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return {
        start: new Date(now.getFullYear(), q * 3, 1),
        end: new Date(now.getFullYear(), q * 3 + 3, 0),
        prevStart: new Date(now.getFullYear(), (q - 1) * 3, 1),
        prevEnd: new Date(now.getFullYear(), q * 3, 0),
      };
    }
    case "year": return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31),
      prevStart: new Date(now.getFullYear() - 1, 0, 1),
      prevEnd: new Date(now.getFullYear() - 1, 11, 31),
    };
    default: return {
      start: today, end: today,
      prevStart: new Date(today.getTime() - 86400000),
      prevEnd: new Date(today.getTime() - 86400000),
    };
  }
}

function filterByRange(bookings: Booking[], start: Date, end: Date): Booking[] {
  const s = dateStr(start), e = dateStr(end);
  return bookings.filter((b) => b.date >= s && b.date <= e);
}

function getChartBuckets(bookings: Booking[], period: RevPeriod): Array<{ label: string; value: number }> {
  const now = new Date();
  const rev = (bList: Booking[]) => bList.reduce((s, b) => s + courtRevenue(b), 0);

  switch (period) {
    case "day":
      return TIME_SLOTS.map((t) => {
        const h = parseInt(t, 10);
        return { label: formatTime(t), value: rev(bookings.filter((b) => parseInt(b.start_time, 10) === h)) };
      });

    case "week": {
      const dow = now.getDay();
      const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dow === 0 ? 6 : dow - 1));
      return ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((label, i) => {
        const iso = dateStr(new Date(mon.getTime() + i * 86400000));
        return { label, value: rev(bookings.filter((b) => b.date === iso)) };
      });
    }

    case "month": {
      const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const mm = (now.getMonth() + 1).toString().padStart(2, "0");
      return Array.from({ length: days }, (_, i) => {
        const iso = `${now.getFullYear()}-${mm}-${(i + 1).toString().padStart(2, "0")}`;
        return { label: `${i + 1}`, value: rev(bookings.filter((b) => b.date === iso)) };
      });
    }

    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return [0, 1, 2].map((i) => {
        const mIdx = q * 3 + i;
        const start = `${now.getFullYear()}-${(mIdx + 1).toString().padStart(2, "0")}-01`;
        const end   = dateStr(new Date(now.getFullYear(), mIdx + 1, 0));
        return { label: MONTH_NAMES[mIdx].slice(0, 3), value: rev(bookings.filter((b) => b.date >= start && b.date <= end)) };
      });
    }

    case "year":
      return Array.from({ length: 12 }, (_, i) => {
        const start = `${now.getFullYear()}-${(i + 1).toString().padStart(2, "0")}-01`;
        const end   = dateStr(new Date(now.getFullYear(), i + 1, 0));
        return { label: MONTH_NAMES[i].slice(0, 3), value: rev(bookings.filter((b) => b.date >= start && b.date <= end)) };
      });
    default:
      return [];
  }
}

// Auto-bucketed chart for arbitrary date ranges
function getCustomChartBuckets(
  bookings: Booking[],
  fromISO: string,
  toISO: string
): Array<{ label: string; value: number }> {
  const rev = (bList: Booking[]) => bList.reduce((s, b) => s + courtRevenue(b), 0);
  const MS = 86400000;
  const fromDate = new Date(fromISO + "T00:00:00");
  const toDate   = new Date(toISO   + "T00:00:00");
  const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / MS) + 1;

  if (spanDays <= 14) {
    // Daily buckets
    return Array.from({ length: spanDays }, (_, i) => {
      const d = new Date(fromDate.getTime() + i * MS);
      const iso = dateStr(d);
      return {
        label: d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
        value: rev(bookings.filter((b) => b.date === iso)),
      };
    });
  } else if (spanDays <= 90) {
    // Weekly buckets (Mon-Sun groups)
    const buckets: Array<{ label: string; value: number }> = [];
    let cur = new Date(fromDate);
    // Align to Monday
    const dowOffset = cur.getDay() === 0 ? 6 : cur.getDay() - 1;
    cur = new Date(cur.getTime() - dowOffset * MS);
    while (cur <= toDate) {
      const weekStart = new Date(Math.max(cur.getTime(), fromDate.getTime()));
      const weekEnd   = new Date(Math.min(cur.getTime() + 6 * MS, toDate.getTime()));
      const s = dateStr(weekStart), e = dateStr(weekEnd);
      buckets.push({
        label: weekStart.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
        value: rev(bookings.filter((b) => b.date >= s && b.date <= e)),
      });
      cur = new Date(cur.getTime() + 7 * MS);
    }
    return buckets;
  } else {
    // Monthly buckets
    const buckets: Array<{ label: string; value: number }> = [];
    let y = fromDate.getFullYear(), m = fromDate.getMonth();
    const endY = toDate.getFullYear(), endM = toDate.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const start = `${y}-${(m + 1).toString().padStart(2, "0")}-01`;
      const end   = dateStr(new Date(y, m + 1, 0));
      const s = start > fromISO ? start : fromISO;
      const e = end   < toISO   ? end   : toISO;
      buckets.push({
        label: MONTH_NAMES[m].slice(0, 3) + (y !== new Date().getFullYear() ? ` '${String(y).slice(2)}` : ""),
        value: rev(bookings.filter((b) => b.date >= s && b.date <= e)),
      });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return buckets;
  }
}

function SalesDashboard({ bookings }: { bookings: Booking[] }) {
  const [period, setPeriod] = useState<RevPeriod>("month");

  // Default custom range = last 30 days
  const defaultTo   = dateStr(new Date());
  const defaultFrom = dateStr(new Date(Date.now() - 29 * 86400000));
  const [customFrom, setCustomFrom] = useState(defaultFrom);
  const [customTo,   setCustomTo  ] = useState(defaultTo);

  const confirmed = bookings.filter((b) => b.status === "confirmed");

  const isValidISODate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00").getTime());

  // Resolve current window + comparison window
  const range = (() => {
    if (period === "custom") {
      const fromSafe = isValidISODate(customFrom) ? customFrom : defaultFrom;
      const toSafe   = isValidISODate(customTo)   ? customTo   : defaultTo;
      const s   = new Date(fromSafe + "T00:00:00");
      const e   = new Date(toSafe   + "T00:00:00");
      const spanMs = e.getTime() - s.getTime() + 86400000;
      const pE  = new Date(s.getTime() - 86400000);
      const pS  = new Date(pE.getTime() - spanMs + 86400000);
      return { start: s, end: e, prevStart: pS, prevEnd: pE };
    }
    return getPeriodRange(period as Exclude<RevPeriod, "custom">);
  })();
  const { start, end, prevStart, prevEnd } = range;

  const cur  = filterByRange(confirmed, start, end);
  const prev = filterByRange(confirmed, prevStart, prevEnd);

  const totalRev   = cur.reduce((s, b) => s + courtRevenue(b), 0);
  const prevRev    = prev.reduce((s, b) => s + courtRevenue(b), 0);
  const revChange  = prevRev > 0 ? ((totalRev - prevRev) / prevRev) * 100 : null;
  const totalSlots = cur.length;
  const prevSlots  = prev.length;
  const avgPerSlot = totalSlots > 0 ? totalRev / totalSlots : 0;

  const courtStats = COURTS.map((c) => ({
    court: c,
    slots: cur.filter((b) => b.court_number === c).length,
    revenue: cur.filter((b) => b.court_number === c).reduce((s, b) => s + courtRevenue(b), 0),
  }));

  const safeFrom = isValidISODate(customFrom) ? customFrom : defaultFrom;
  const safeTo   = isValidISODate(customTo)   ? customTo   : defaultTo;
  const chartData = period === "custom"
    ? getCustomChartBuckets(cur, safeFrom, safeTo)
    : getChartBuckets(cur, period);
  const maxVal = Math.max(...chartData.map((d) => d.value), 1);

  const PERIOD_OPTS: Array<{ key: RevPeriod; label: string }> = [
    { key: "day",     label: "Today" },
    { key: "week",    label: "This Week" },
    { key: "month",   label: "This Month" },
    { key: "quarter", label: "This Quarter" },
    { key: "year",    label: "This Year" },
    { key: "custom",  label: "Custom Range" },
  ];

  const now = new Date();
  const fmtShort = (d: Date) => d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const periodLabel = (() => {
    switch (period) {
      case "day":     return now.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      case "week":    return `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
      case "month":   return now.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
      case "quarter": return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
      case "year":    return `${now.getFullYear()}`;
      case "custom":  return `${fmtShort(start)} – ${fmtShort(end)}`;
    }
  })();

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {PERIOD_OPTS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              period === key
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/50"
            }`}
          >
            {label}
          </button>
        ))}
        {period !== "custom" && (
          <span className="ml-auto text-sm text-muted-foreground hidden sm:block">{periodLabel}</span>
        )}
      </div>

      {/* Custom date range inputs */}
      {period === "custom" && (
        <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/40 rounded-lg border border-border/60">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">From</label>
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">To</label>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={dateStr(new Date())}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2 pb-0.5">
            <button
              onClick={() => { setCustomFrom(dateStr(new Date(Date.now() - 6 * 86400000))); setCustomTo(defaultTo); }}
              className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors"
            >
              Last 7 days
            </button>
            <button
              onClick={() => { setCustomFrom(dateStr(new Date(Date.now() - 29 * 86400000))); setCustomTo(defaultTo); }}
              className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors"
            >
              Last 30 days
            </button>
            <button
              onClick={() => { setCustomFrom(dateStr(new Date(Date.now() - 89 * 86400000))); setCustomTo(defaultTo); }}
              className="px-3 py-1.5 rounded-md text-xs border border-border hover:bg-muted transition-colors"
            >
              Last 90 days
            </button>
          </div>
          <span className="ml-auto text-xs text-muted-foreground hidden sm:block self-end pb-0.5">{periodLabel}</span>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Total Revenue</CardDescription>
            <CardTitle className="text-3xl">₱{totalRev.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            {revChange !== null ? (
              <p className={`text-xs font-medium ${revChange >= 0 ? "text-green-600" : "text-red-500"}`}>
                {revChange >= 0 ? "▲" : "▼"} {Math.abs(revChange).toFixed(1)}% vs prev period
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Court-Hours Booked</CardDescription>
            <CardTitle className="text-3xl">{totalSlots}</CardTitle>
          </CardHeader>
          <CardContent>
            {prevSlots > 0 ? (
              <p className={`text-xs font-medium ${totalSlots >= prevSlots ? "text-green-600" : "text-red-500"}`}>
                {totalSlots >= prevSlots ? "▲" : "▼"} {Math.abs(totalSlots - prevSlots)} vs prev period
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Confirmed only</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Avg Revenue / Slot</CardDescription>
            <CardTitle className="text-3xl">₱{Math.round(avgPerSlot).toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Courts 1 &amp; 2: ₱320 · Court 3: ₱300</p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base">Revenue Breakdown</CardTitle>
          <CardDescription>{periodLabel}</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 pb-4">
          {totalRev === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No confirmed bookings in this period
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div
                className="flex items-end gap-[3px]"
                style={{ minHeight: "180px", minWidth: `${chartData.length * 30}px` }}
              >
                {chartData.map((d, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-1 flex-1 group relative"
                    style={{ minWidth: "20px" }}
                  >
                    {/* Tooltip on hover */}
                    {d.value > 0 && (
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] whitespace-nowrap bg-foreground text-background rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        ₱{d.value.toLocaleString()}
                      </span>
                    )}
                    <div
                      className="w-full rounded-t transition-all"
                      style={{
                        height: `${Math.max((d.value / maxVal) * 150, d.value > 0 ? 4 : 1)}px`,
                        backgroundColor: d.value > 0 ? "#3b82f6" : "#e5e7eb",
                        opacity: d.value > 0 ? 1 : 0.35,
                      }}
                    />
                    <span
                      className="text-[9px] text-muted-foreground leading-none truncate w-full text-center"
                      style={{ maxWidth: "40px" }}
                    >
                      {d.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Court breakdown */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base">By Court</CardTitle>
          <CardDescription>Slot count and revenue per court · {periodLabel}</CardDescription>
        </CardHeader>
        <CardContent className="pt-5 pb-4 space-y-4">
          {courtStats.map(({ court, slots, revenue }) => (
            <div key={court} className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm font-medium w-20 shrink-0">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: COURT_COLORS[court - 1] }}
                />
                Court {court}
              </span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: totalSlots > 0 ? `${(slots / totalSlots) * 100}%` : "0%",
                    backgroundColor: COURT_COLORS[court - 1],
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-14 text-right shrink-0">
                {slots} hr{slots !== 1 ? "s" : ""}
              </span>
              <span className="text-sm font-medium w-20 text-right shrink-0">
                ₱{revenue.toLocaleString()}
              </span>
            </div>
          ))}

          {totalSlots === 0 && (
            <p className="text-sm text-muted-foreground">No confirmed bookings this period.</p>
          )}

          {/* Total row */}
          {totalSlots > 0 && (
            <div className="flex items-center gap-3 pt-3 border-t">
              <span className="text-sm font-semibold w-20 shrink-0">Total</span>
              <div className="flex-1" />
              <span className="text-xs text-muted-foreground w-14 text-right shrink-0">
                {totalSlots} hr{totalSlots !== 1 ? "s" : ""}
              </span>
              <span className="text-sm font-bold w-20 text-right shrink-0">
                ₱{totalRev.toLocaleString()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
  const [tab, setTab] = useState<"calendar" | "bookings" | "enrollments" | "contacts" | "revenue">(
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
    { key: "revenue",     label: "💰 Revenue" },
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

        {/* ── Revenue dashboard ─────────────────────────── */}
        {tab === "revenue" && <SalesDashboard bookings={bookings} />}

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
