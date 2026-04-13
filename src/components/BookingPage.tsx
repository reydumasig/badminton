"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createAuthBrowserClient } from "@/lib/supabase-auth-browser";

// ─── Constants ────────────────────────────────────────────────
const COURTS = [1, 2, 3];

// Court 1 & 2 → ₱320/hr · Court 3 → ₱300/hr
function courtPrice(court: number): number {
  return court === 3 ? 300 : 320;
}

const TIME_SLOTS: string[] = [];
for (let h = 6; h < 22; h++) {
  TIME_SLOTS.push(`${h.toString().padStart(2, "0")}:00`);
}

function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:00 ${period}`;
}

function formatEndTime(startTime: string) {
  const h = parseInt(startTime.split(":")[0], 10);
  return formatTime(`${(h + 1).toString().padStart(2, "0")}:00`);
}

function formatDateDisplay(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
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

function slotKey(court: number, time: string) {
  return `${court}::${time}`;
}

// ─── Types ────────────────────────────────────────────────────
const guestSchema = z.object({
  name: z.string().min(2, "Please enter your full name."),
  email: z.string().email("Please enter a valid email."),
  phone: z.string().min(7, "Please enter a valid phone number."),
});
type GuestData = z.infer<typeof guestSchema>;

type BookedSlot = { court: number; time: string };
type SelectedSlot = { court: number; time: string };
type Step = "date" | "slot" | "details" | "confirmed";

// ─── Payment QR Codes Card ────────────────────────────────────
function PaymentQRCodes() {
  return (
    <Card className="max-w-md border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-yellow-900 dark:text-yellow-100">
          💳 Payment via InstaPay / GCash
        </CardTitle>
        <CardDescription className="text-yellow-700 dark:text-yellow-400">
          Scan a QR code below to pay in advance, then upload your proof of payment after booking.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3">
          {/* RCBC */}
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl overflow-hidden border-2 border-yellow-200 dark:border-yellow-700 bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/rcbc-qr.png"
                alt="RCBC InstaPay QR Code – Grace Dizer"
                className="w-full object-contain"
              />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-100">RCBC InstaPay</p>
              <p className="text-[11px] text-yellow-700 dark:text-yellow-400">Grace Dizer · ****9527</p>
            </div>
          </div>
          {/* GCash */}
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-xl overflow-hidden border-2 border-yellow-200 dark:border-yellow-700 bg-white shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/gcash-qr.png"
                alt="GCash QR Code – Grace Dizer"
                className="w-full object-contain"
              />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-100">GCash</p>
              <p className="text-[11px] text-yellow-700 dark:text-yellow-400">0927 222 ···· · WG942J</p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-yellow-600 dark:text-yellow-500 text-center">
          After confirming your booking you&apos;ll be able to upload your payment screenshot.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Proof Upload (confirmed step, logged-in users) ───────────
function ConfirmedProofUpload({ bookingIds }: { bookingIds: string[] }) {
  const [proofUrl, setProofUrl]         = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [success, setSuccess]           = useState(false);
  const [error, setError]               = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError("");
    setSuccess(false);
    try {
      // Upload proof to all bookingIds in this batch
      let lastUrl = "";
      for (const id of bookingIds) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("bookingId", id);
        const res  = await fetch("/api/bookings/proof", { method: "POST", body: fd });
        const json = await res.json();
        if (!res.ok) { setError(json.error || "Upload failed."); setUploading(false); return; }
        lastUrl = json.url;
      }
      setProofUrl(lastUrl);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    setError("");
    try {
      for (const id of bookingIds) {
        await fetch("/api/bookings/proof", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId: id }),
        });
      }
      setProofUrl(null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-blue-900 dark:text-blue-100">
          📎 Upload Proof of Payment
        </CardTitle>
        <CardDescription className="text-blue-700 dark:text-blue-400">
          Already paid via InstaPay or GCash? Upload your screenshot here.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {proofUrl ? (
          /* ── Has proof ── */
          <div className="rounded-lg border border-blue-200 dark:border-blue-700 overflow-hidden bg-white dark:bg-blue-900">
            <a href={proofUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={proofUrl}
                alt="Payment proof"
                className="w-full max-h-48 object-contain bg-black/5 hover:opacity-90 transition-opacity"
              />
            </a>
            <div className="flex items-center justify-between px-3 py-2 border-t border-blue-100 dark:border-blue-700">
              <span className="text-xs text-green-700 dark:text-green-400 font-medium">
                {success ? "✓ Uploaded successfully!" : "✓ Proof submitted"}
              </span>
              <div className="flex items-center gap-3 text-xs">
                <a href={proofUrl} target="_blank" rel="noopener noreferrer"
                  className="text-blue-700 dark:text-blue-300 hover:underline">
                  View ↗
                </a>
                <button
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 disabled:opacity-40">
                  Replace
                </button>
                <button
                  disabled={uploading}
                  onClick={handleRemove}
                  className="text-red-500 hover:text-red-700 disabled:opacity-40">
                  {uploading ? "Removing…" : "Remove"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── No proof yet ── */
          <button
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-lg px-4 py-6 flex flex-col items-center gap-2 text-blue-600 dark:text-blue-400 hover:border-blue-500 hover:text-blue-800 dark:hover:text-blue-200 transition-colors disabled:opacity-40"
          >
            {uploading ? (
              <span className="text-sm">Uploading…</span>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span className="text-sm font-medium">Tap to upload payment screenshot</span>
                <span className="text-xs opacity-70">JPG, PNG, WEBP, GIF, HEIC · max 5 MB</span>
              </>
            )}
          </button>
        )}

        {success && !proofUrl && (
          <p className="text-xs text-green-700 dark:text-green-400">✓ Proof uploaded successfully!</p>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────
export default function BookingPage() {
  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [booked, setBooked] = useState<BookedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmedSlots, setConfirmedSlots] = useState<SelectedSlot[]>([]);
  const [bookingIds, setBookingIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createAuthBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const { register, handleSubmit, formState: { errors } } = useForm<GuestData>({
    resolver: zodResolver(guestSchema),
  });

  const fetchAvailability = useCallback(async (date: string) => {
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/bookings/available?date=${date}`);
      const json = await res.json();
      setBooked(json.booked ?? []);
    } catch {
      setBooked([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDate) fetchAvailability(selectedDate);
  }, [selectedDate, fetchAvailability]);

  const isBooked = (court: number, time: string) =>
    booked.some((b) => b.court === court && b.time === time);

  const isPast = (time: string) => {
    if (!selectedDate) return false;
    const now = new Date();
    const slotDate = new Date(`${selectedDate}T${time}:00`);
    return slotDate <= now;
  };

  const toggleSlot = (court: number, time: string) => {
    const key = slotKey(court, time);
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isSelected = (court: number, time: string) =>
    selectedSlots.has(slotKey(court, time));

  const getSelectedSlotsList = (): SelectedSlot[] =>
    Array.from(selectedSlots)
      .map((key) => {
        const [courtStr, time] = key.split("::");
        return { court: parseInt(courtStr, 10), time };
      })
      .sort((a, b) => a.court - b.court || a.time.localeCompare(b.time));

  const totalPrice = Array.from(selectedSlots).reduce((sum, key) => {
    const court = parseInt(key.split("::")[0], 10);
    return sum + courtPrice(court);
  }, 0);

  // ── Handlers ───────────────────────────────────────────────
  const handleDateConfirm = () => {
    if (!selectedDate) return;
    setSelectedSlots(new Set());
    setStep("slot");
  };

  const handleSlotConfirm = () => {
    if (selectedSlots.size === 0) return;
    setStep("details");
  };

  const onSubmit = async (data: GuestData) => {
    setSubmitting(true);
    setSubmitError("");
    const slots = getSelectedSlotsList();
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          slots: slots.map((s) => ({
            courtNumber: s.court,
            startTime: s.time,
          })),
          userId: userId ?? undefined,
          ...data,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || "Booking failed. Please try again.");
        setSubmitting(false);
        return;
      }
      setConfirmedSlots(slots);
      setBookingIds(json.bookingIds ?? []);
      setStep("confirmed");
    } catch {
      setSubmitError("Network error. Please check your connection.");
      setSubmitting(false);
    }
  };

  // ── Step: Date ─────────────────────────────────────────────
  if (step === "date") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Select a Date</h2>
          <p className="text-sm text-muted-foreground mt-1">
            You can book up to 30 days in advance.
          </p>
        </div>
        <Card className="max-w-sm">
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="text-sm font-medium">Date</label>
              <Input
                type="date"
                className="mt-2"
                min={todayString()}
                max={maxDateString()}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={!selectedDate}
              onClick={handleDateConfirm}
            >
              See Available Slots
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step: Slot Grid ────────────────────────────────────────
  if (step === "slot") {
    const slotsList = getSelectedSlotsList();
    return (
      <div className="space-y-5 pb-40">
        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <button
            onClick={() => setStep("date")}
            className="text-sm text-muted-foreground hover:text-foreground mt-1"
          >
            ← Back
          </button>
          <div>
            <h2 className="text-xl font-semibold">Pick Courts &amp; Times</h2>
            <p className="text-sm text-muted-foreground">
              {formatDateDisplay(selectedDate)} · Tap multiple slots to add them to your cart
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-green-100 border border-green-300 dark:bg-green-900" />
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-blue-500 border border-blue-600" />
            Selected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-muted border border-border" />
            Booked / Past
          </span>
        </div>

        {/* Court grid */}
        {loadingSlots ? (
          <p className="text-sm text-muted-foreground">Loading availability…</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table
              className="text-sm border-collapse w-full"
              style={{ minWidth: `${90 + COURTS.length * 120}px` }}
            >
              <thead className="bg-muted/50">
                <tr>
                  <th className="py-3 px-4 text-left text-muted-foreground font-medium w-24 sticky left-0 bg-muted/50">
                    Time
                  </th>
                  {COURTS.map((c) => (
                    <th
                      key={c}
                      className="py-3 px-3 text-center font-semibold min-w-[110px]"
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
                    className={
                      rowIdx % 2 === 0
                        ? "border-t border-border/50"
                        : "border-t border-border/50 bg-muted/20"
                    }
                  >
                    <td className="py-2 px-4 text-muted-foreground whitespace-nowrap sticky left-0 bg-background text-xs font-medium">
                      {formatTime(time)}
                    </td>
                    {COURTS.map((court) => {
                      const taken = isBooked(court, time);
                      const past = isPast(time);
                      const unavailable = taken || past;
                      const sel = isSelected(court, time);

                      return (
                        <td key={court} className="py-2 px-2 text-center">
                          <button
                            disabled={unavailable}
                            onClick={() => toggleSlot(court, time)}
                            className={`w-full rounded-md py-2 px-2 text-xs font-semibold transition-all border
                              ${
                                sel
                                  ? "bg-blue-500 text-white border-blue-600 shadow ring-2 ring-blue-300 dark:ring-blue-700"
                                  : unavailable
                                  ? "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-40"
                                  : "bg-green-50 text-green-800 border-green-200 hover:bg-green-100 hover:border-green-400 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
                              }`}
                          >
                            {taken ? "Booked" : past ? "Past" : sel ? "✓ Added" : "Open"}
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

        {/* Sticky Cart */}
        {slotsList.length > 0 && (
          <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-8 md:max-w-md">
            <Card className="border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950 shadow-2xl">
              <CardContent className="pt-3 pb-3 px-4">
                {/* Cart header */}
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-blue-900 dark:text-blue-100 text-sm">
                    🛒 {slotsList.length} slot{slotsList.length > 1 ? "s" : ""} selected
                  </p>
                  <p className="font-bold text-blue-900 dark:text-blue-100 text-base">
                    ₱{totalPrice.toLocaleString()}
                  </p>
                </div>

                {/* Selected slot chips */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {slotsList.map((s) => (
                    <span
                      key={slotKey(s.court, s.time)}
                      className="inline-flex items-center gap-1 text-xs bg-white dark:bg-blue-900 border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200 rounded-full px-2.5 py-1 font-medium"
                    >
                      Court {s.court} · {formatTime(s.time)}
                      <button
                        onClick={() => toggleSlot(s.court, s.time)}
                        className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors leading-none font-bold"
                        aria-label="Remove slot"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  onClick={handleSlotConfirm}
                >
                  Proceed to Checkout →
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ── Step: Details ──────────────────────────────────────────
  if (step === "details") {
    const slotsList = getSelectedSlotsList();
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep("slot")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <h2 className="text-xl font-semibold">Checkout</h2>
        </div>

        {/* Order Summary */}
        <Card className="max-w-md border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-blue-900 dark:text-blue-100">
              Order Summary
            </CardTitle>
            <CardDescription className="text-blue-700 dark:text-blue-300">
              {formatDateDisplay(selectedDate)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {slotsList.map((s) => (
              <div
                key={slotKey(s.court, s.time)}
                className="flex justify-between text-sm text-blue-900 dark:text-blue-100"
              >
                <span>
                  Court {s.court} · {formatTime(s.time)}–{formatEndTime(s.time)}
                </span>
                <span className="font-medium">₱{courtPrice(s.court)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-sm pt-2 border-t border-blue-200 dark:border-blue-700 text-blue-900 dark:text-blue-100 mt-2">
              <span>Total ({slotsList.length} slot{slotsList.length > 1 ? "s" : ""})</span>
              <span>₱{totalPrice.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment QR Codes */}
        <PaymentQRCodes />

        {/* Contact Form */}
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
            <CardDescription>
              We&apos;ll send your confirmation to this email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="Your full name"
                  className="mt-2"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">
                  Email <span className="text-destructive">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="you@email.com"
                  className="mt-2"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">
                  Phone <span className="text-destructive">*</span>
                </label>
                <Input
                  type="tel"
                  placeholder="+63..."
                  className="mt-2"
                  {...register("phone")}
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-destructive">
                    {errors.phone.message}
                  </p>
                )}
              </div>
              {submitError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {submitError}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
              >
                {submitting
                  ? "Confirming…"
                  : `Confirm ${slotsList.length} Booking${slotsList.length > 1 ? "s" : ""} · ₱${totalPrice.toLocaleString()}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step: Confirmed ────────────────────────────────────────
  const confirmedTotal = confirmedSlots.reduce((sum, s) => sum + courtPrice(s.court), 0);
  return (
    <div className="space-y-6 max-w-md">
      {/* Confirmation card */}
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CardHeader>
          <Badge
            variant="outline"
            className="w-fit border-green-400 text-green-700 dark:text-green-300"
          >
            ✓ Confirmed
          </Badge>
          <CardTitle className="text-green-800 dark:text-green-200">
            {confirmedSlots.length > 1
              ? `${confirmedSlots.length} Bookings Confirmed!`
              : "Booking Confirmed!"}
          </CardTitle>
          <CardDescription className="text-green-700 dark:text-green-300">
            A confirmation has been sent to your email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-semibold text-green-800 dark:text-green-200">
            {formatDateDisplay(selectedDate)}
          </p>
          <div className="space-y-2">
            {confirmedSlots.map((s, i) => (
              <div
                key={i}
                className="flex justify-between text-green-800 dark:text-green-200 bg-white/60 dark:bg-black/10 rounded-md px-3 py-2"
              >
                <span>
                  Court {s.court} · {formatTime(s.time)}–{formatEndTime(s.time)}
                </span>
                <span className="font-medium">₱{courtPrice(s.court)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between font-bold text-green-900 dark:text-green-100 pt-1 border-t border-green-200 dark:border-green-700">
            <span>Total</span>
            <span>₱{confirmedTotal.toLocaleString()}</span>
          </div>
          {bookingIds.length > 0 && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Ref: {bookingIds[0].split("-")[0].toUpperCase()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Proof of payment upload (logged-in users with booking IDs) */}
      {userId && bookingIds.length > 0 && (
        <ConfirmedProofUpload bookingIds={bookingIds} />
      )}

      {/* QR codes reminder for guests who haven't paid yet */}
      {!userId && <PaymentQRCodes />}

      <div className="flex gap-3 flex-wrap">
        <Button
          variant="outline"
          onClick={() => {
            setStep("date");
            setSelectedDate("");
            setSelectedSlots(new Set());
            setConfirmedSlots([]);
            setBookingIds([]);
          }}
        >
          Book Another
        </Button>
        {userId && (
          <Button asChild variant="outline">
            <a href="/member">View My Bookings</a>
          </Button>
        )}
      </div>
    </div>
  );
}
