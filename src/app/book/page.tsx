import BookingPage from "@/components/BookingPage";

export const metadata = {
  title: "Book a Court – Badminton District",
  description: "Reserve a badminton court at Badminton District. 3 courts available, 6AM–10PM daily.",
};

export default function Book() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/90 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-4">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to site
          </a>
          <div className="flex items-center gap-4">
            <a href="/member" className="text-sm text-muted-foreground hover:text-foreground font-medium">
              My Bookings
            </a>
            <span className="text-sm font-semibold">Badminton District</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10 space-y-2">
        <div className="space-y-1 mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">Book a Court</h1>
          <p className="text-muted-foreground">
            3 indoor courts · 6AM–10PM daily · Pay at venue
          </p>
        </div>
        <BookingPage />
      </main>
    </div>
  );
}
