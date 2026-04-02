"use client";

import { useState, useEffect, useCallback } from "react";
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

// ─── Form Schema ──────────────────────────────────────────────
const guestSchema = z.object({
  name: z.string().min(2, "Please enter your full name."),
  email: z.string().email("Please enter a valid email."),
  phone: z.string().min(7, "Please enter a valid phone number."),
});
type GuestData = z.infer<typeof guestSchema>;

type BookedSlot = { court: number; time: string };
type Step = "date" | "slot" | "details" | "confirmed";

// ─── Component ───────────────────────────────────────────────
export default function BookingPage() {
  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedCourt, setSelectedCourt] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [booked, setBooked] = useState<BookedSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Check if user is logged in — used to link booking to their account
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

  const handleDateConfirm = () => {
    if (!selectedDate) return;
    setSelectedCourt(null);
    setSelectedTime(null);
    setStep("slot");
  };

  const handleSlotSelect = (court: number, time: string) => {
    setSelectedCourt(court);
    setSelectedTime(time);
  };

  const handleSlotConfirm = () => {
    if (!selectedCourt || !selectedTime) return;
    setStep("details");
  };

  const onSubmit = async (data: GuestData) => {
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          startTime: selectedTime,
          courtNumber: selectedCourt,
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
      setBookingId(json.bookingId);
      setStep("confirmed");
    } catch {
      setSubmitError("Network error. Please check your connection.");
      setSubmitting(false);
    }
  };

  // ── Step: Date ──────────────────────────────────────────────
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

  // ── Step: Slot Grid ─────────────────────────────────────────
  if (step === "slot") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setStep("date")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <div>
            <h2 className="text-xl font-semibold">Pick a Court & Time</h2>
            <p className="text-sm text-muted-foreground">
              {formatDateDisplay(selectedDate)}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-green-100 border border-green-300 dark:bg-green-900" />
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-accent border border-accent" />
            Selected
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-muted border border-border" />
            Booked / Past
          </span>
        </div>

        {loadingSlots ? (
          <p className="text-sm text-muted-foreground">Loading availability…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="py-2 pr-4 text-left text-muted-foreground font-medium w-24">
                    Time
                  </th>
                  {COURTS.map((c) => (
                    <th key={c} className="py-2 px-2 text-center font-medium min-w-[100px]">
                      Court {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((time) => (
                  <tr key={time} className="border-t border-border/50">
                    <td className="py-1.5 pr-4 text-muted-foreground whitespace-nowrap">
                      {formatTime(time)}
                    </td>
                    {COURTS.map((court) => {
                      const taken = isBooked(court, time);
                      const past = isPast(time);
                      const unavailable = taken || past;
                      const isSelected =
                        selectedCourt === court && selectedTime === time;

                      return (
                        <td key={court} className="py-1.5 px-2 text-center">
                          <button
                            disabled={unavailable}
                            onClick={() => handleSlotSelect(court, time)}
                            className={`w-full rounded-md py-1.5 px-2 text-xs font-medium transition-colors border
                              ${
                                isSelected
                                  ? "bg-accent text-accent-foreground border-accent"
                                  : unavailable
                                  ? "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50"
                                  : "bg-green-50 text-green-800 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:text-green-200 dark:border-green-800"
                              }`}
                          >
                            {taken ? "Booked" : past ? "Past" : isSelected ? "Selected" : "Open"}
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

        {selectedCourt && selectedTime && (
          <Card className="border-accent/40 bg-accent/5 max-w-sm">
            <CardContent className="pt-4 pb-4 flex items-center justify-between gap-4">
              <div className="text-sm">
                <p className="font-medium">
                  Court {selectedCourt} · {formatTime(selectedTime)}–{formatTime(`${(parseInt(selectedTime) + 1).toString().padStart(2, "0")}:00`)}
                </p>
                <p className="text-muted-foreground">{formatDateDisplay(selectedDate)}</p>
              </div>
              <Button size="sm" onClick={handleSlotConfirm}>
                Book This Slot
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Step: Guest Details ─────────────────────────────────────
  if (step === "details") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep("slot")}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
          <h2 className="text-xl font-semibold">Your Details</h2>
        </div>

        <Card className="max-w-sm border-accent/40 bg-accent/5">
          <CardContent className="pt-4 pb-3 text-sm space-y-0.5">
            <p className="font-medium">
              Court {selectedCourt} · {formatTime(selectedTime!)}–{formatTime(`${(parseInt(selectedTime!) + 1).toString().padStart(2, "0")}:00`)}
            </p>
            <p className="text-muted-foreground">{formatDateDisplay(selectedDate)}</p>
            <p className="text-muted-foreground">Pay at venue upon arrival</p>
          </CardContent>
        </Card>

        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
            <CardDescription>We'll send your confirmation to this email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  Full Name <span className="text-destructive">*</span>
                </label>
                <Input placeholder="Your full name" className="mt-2" {...register("name")} />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">
                  Email <span className="text-destructive">*</span>
                </label>
                <Input type="email" placeholder="you@email.com" className="mt-2" {...register("email")} />
                {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">
                  Phone <span className="text-destructive">*</span>
                </label>
                <Input type="tel" placeholder="+63..." className="mt-2" {...register("phone")} />
                {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
              </div>
              {submitError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{submitError}</p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Confirming…" : "Confirm Booking"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Step: Confirmed ─────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-sm">
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CardHeader>
          <Badge variant="outline" className="w-fit border-green-400 text-green-700 dark:text-green-300">
            Confirmed
          </Badge>
          <CardTitle className="text-green-800 dark:text-green-200">Booking Confirmed!</CardTitle>
          <CardDescription className="text-green-700 dark:text-green-300">
            A confirmation has been sent to your email. Please pay at the venue upon arrival.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-green-800 dark:text-green-200">
          <p><span className="text-green-600 dark:text-green-400">Court</span> · Court {selectedCourt}</p>
          <p><span className="text-green-600 dark:text-green-400">Date</span> · {formatDateDisplay(selectedDate)}</p>
          <p>
            <span className="text-green-600 dark:text-green-400">Time</span> · {formatTime(selectedTime!)}–{formatTime(`${(parseInt(selectedTime!) + 1).toString().padStart(2, "0")}:00`)}
          </p>
          {bookingId && (
            <p className="text-xs text-green-600 dark:text-green-400 pt-1">
              Ref: {bookingId.split("-")[0].toUpperCase()}
            </p>
          )}
        </CardContent>
      </Card>
      <Button
        variant="outline"
        onClick={() => {
          setStep("date");
          setSelectedDate("");
          setSelectedCourt(null);
          setSelectedTime(null);
          setBookingId("");
        }}
      >
        Book Another Court
      </Button>
    </div>
  );
}
