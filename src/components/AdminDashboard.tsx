"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
};

function formatTime(t: string) {
  const [h] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:00 ${period}`;
}

const statusColors: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  contacted: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  enrolled: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  declined: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  read: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  replied: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard({
  enrollments,
  contacts,
  bookings,
}: {
  enrollments: Enrollment[];
  contacts: Contact[];
  bookings: Booking[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"enrollments" | "contacts" | "bookings">("bookings");
  const [loggingOut, setLoggingOut] = useState(false);
  const [expandedContact, setExpandedContact] = useState<string | null>(null);

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Admin
            </p>
            <h1 className="text-lg font-semibold tracking-tight">
              Dizer Badminton Academy
            </h1>
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

      <main className="mx-auto w-full max-w-6xl px-6 py-10 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Bookings</CardDescription>
              <CardTitle className="text-3xl">{bookings.length}</CardTitle>
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
        <div className="flex gap-4 border-b">
          {(["bookings", "enrollments", "contacts"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "bookings"
                ? `Bookings (${bookings.length})`
                : t === "enrollments"
                ? `Enrollments (${enrollments.length})`
                : `Inquiries (${contacts.length})`}
            </button>
          ))}
        </div>

        {/* Bookings Table */}
        {tab === "bookings" && (
          <Card>
            <CardContent className="p-0">
              {bookings.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No bookings yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {["Date", "Time", "Court", "Name", "Email", "Phone", "Status"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b, i) => (
                        <tr key={b.id} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {new Date(b.date + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatTime(b.start_time)} – {formatTime(`${(parseInt(b.start_time) + 1).toString().padStart(2, "0")}:00`)}
                          </td>
                          <td className="px-4 py-3 text-center font-medium">Court {b.court_number}</td>
                          <td className="px-4 py-3 font-medium">{b.name}</td>
                          <td className="px-4 py-3">
                            <a href={`mailto:${b.email}`} className="text-primary underline-offset-2 hover:underline">{b.email}</a>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{b.phone}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[b.status] ?? ""}`}>
                              {b.status}
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

        {/* Enrollments Table */}
        {tab === "enrollments" && (
          <Card>
            <CardContent className="p-0">
              {enrollments.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No registrations yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Program
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.map((e, i) => (
                        <tr
                          key={e.id}
                          className={`border-b last:border-0 ${
                            i % 2 === 0 ? "" : "bg-muted/20"
                          }`}
                        >
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(e.created_at)}
                          </td>
                          <td className="px-4 py-3 font-medium">{e.name}</td>
                          <td className="px-4 py-3">
                            <a
                              href={`mailto:${e.email}`}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {e.email}
                            </a>
                          </td>
                          <td className="px-4 py-3">{e.program}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                statusColors[e.status] ?? ""
                              }`}
                            >
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

        {/* Contacts Table */}
        {tab === "contacts" && (
          <Card>
            <CardContent className="p-0">
              {contacts.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  No inquiries yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Phone
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Message
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c, i) => (
                        <tr
                          key={c.id}
                          className={`border-b last:border-0 ${
                            i % 2 === 0 ? "" : "bg-muted/20"
                          }`}
                        >
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                            {formatDate(c.created_at)}
                          </td>
                          <td className="px-4 py-3 font-medium">{c.name}</td>
                          <td className="px-4 py-3">
                            <a
                              href={`mailto:${c.email}`}
                              className="text-primary underline-offset-2 hover:underline"
                            >
                              {c.email}
                            </a>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {c.phone ?? "—"}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <button
                              onClick={() =>
                                setExpandedContact(
                                  expandedContact === c.id ? null : c.id
                                )
                              }
                              className="text-left"
                            >
                              {expandedContact === c.id ? (
                                <span className="whitespace-pre-wrap">
                                  {c.message}
                                </span>
                              ) : (
                                <span className="line-clamp-2 text-muted-foreground">
                                  {c.message}
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                statusColors[c.status] ?? ""
                              }`}
                            >
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
