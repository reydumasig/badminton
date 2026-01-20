import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const philosophyPoints = [
  {
    title: "Purpose-Driven Training",
    text: "Every drill. Every match. Every session is intentional. Growth begins with purpose.",
  },
  {
    title: "Structured Development",
    text: "From foundations to advanced performance, every stage builds skill, speed, and strategy.",
  },
  {
    title: "Discipline On & Off Court",
    text: "Athletes cultivate responsibility, balance, and respect—habits that extend beyond the court.",
  },
  {
    title: "Mental & Physical Resilience",
    text: "Training strengthens the body and the mind: focus, adaptability, and recovery are core to every session.",
  },
  {
    title: "Community & Culture",
    text: "A culture where athletes support, challenge, and inspire each other—because growth happens together.",
  },
  {
    title: "Our Commitment",
    text: "We don’t just train players—we develop athletes with intention, discipline, and the mindset for long-term success.",
  },
];

const programs = [
  {
    title: "Junior Development",
    text: "Foundation training for athletes.",
  },
  {
    title: "High-Performance",
    text: "Advanced training for competitive players.",
  },
  {
    title: "Sponsored Athletes",
    text: "Full or partial support for selected trainees.",
  },
  {
    title: "Corporate and Adult Training",
    text: "Custom programs for working professionals.",
  },
];

const venueLogos = [
  {
    src: "/images/BD%20logo%201.jpg",
    alt: "Badminton District logo",
  },
  {
    src: "/images/bd%20logo%202.jpg",
    alt: "Badminton District logo",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Button
        asChild
        className="fixed right-6 top-1/2 z-50 -translate-y-1/2 rounded-full px-5 py-3 text-sm shadow-lg"
      >
        <a href="#contact">Book a Court</a>
      </Button>

      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-semibold tracking-tight">
                Dizer Badminton Academy
              </div>
              <Badge className="border border-accent/60 bg-accent text-accent-foreground">
                Home of Dizer Badminton Academy
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <Image
                src="/images/BD%20logo%201.jpg"
                alt="Badminton District logo"
                width={64}
                height={32}
                className="h-6 w-auto object-contain"
              />
              <span>Badminton District</span>
            </div>
          </div>
          <NavigationMenu className="w-full justify-start">
            <NavigationMenuList className="flex flex-wrap items-center justify-start gap-2 text-sm font-medium text-muted-foreground">
              {[
                { href: "#home", label: "Home" },
                { href: "#academy-about", label: "Academy" },
                { href: "#academy-about", label: "About" },
                { href: "#training-philosophy", label: "Training Philosophy" },
                { href: "#pathway", label: "Student Pathway" },
                { href: "#coaches", label: "Coaches" },
                { href: "#partners", label: "School Partners" },
                { href: "#programs", label: "Programs" },
                { href: "#enroll", label: "Enroll" },
                { href: "#badminton-district", label: "Badminton District" },
                { href: "#district-about", label: "About" },
                { href: "#courts", label: "Courts and Amenities" },
                { href: "#packages", label: "Event Packages" },
                { href: "#rules", label: "Rules and Guidelines" },
                { href: "#contact", label: "Contact" },
              ].map((item) => (
                <NavigationMenuItem key={`${item.href}-${item.label}`}>
                  <NavigationMenuLink
                    href={item.href}
                    className={navigationMenuTriggerStyle()}
                  >
                    {item.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-20">
        <section id="home" className="flex flex-col gap-8 py-16">
          <Badge variant="outline" className="uppercase tracking-[0.2em]">
            Dizer Badminton Academy
          </Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              A Structured Badminton Training Academy
            </h1>
            <p className="text-lg text-muted-foreground">
              Housed at Badminton District
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#programs">See Our Programs</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#enroll">Enroll Now</a>
            </Button>
          </div>
        </section>

        <Separator className="my-8" />

        <section id="academy-about" className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">
              About Dizer Badminton Academy
            </h2>
            <p className="text-muted-foreground">
              Dizer Badminton Academy is the deliberate evolution of our vision
              for a structured badminton training institution focused on
              athlete development.
            </p>
            <p className="text-muted-foreground">
              We operate with the discipline of a school, the standards of a
              corporate organization and the heart of a high-performance sports
              program.
            </p>
          </div>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src="/images/IMG_4904.JPG"
                  alt="Athlete training session"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator className="my-10" />

        <section id="training-philosophy" className="space-y-8">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">
              Training with Purpose. Growth Through Intention. Mastery through
              Discipline.
            </h2>
            <p className="text-muted-foreground">
              Every session. Every drill. Every athlete. Intentional training
              builds discipline and results follow naturally.
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative aspect-[4/3] w-full">
                  <Image
                    src="/images/IMG_4889.JPG"
                    alt="Trainees doing drills"
                    fill
                    className="object-cover"
                  />
                </div>
              </CardContent>
            </Card>
            <div className="grid gap-4 sm:grid-cols-2">
              {philosophyPoints.map((item) => (
                <Card key={item.title}>
                  <CardHeader>
                    <CardTitle className="text-sm">{item.title}</CardTitle>
                    <CardDescription>{item.text}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
          <Button asChild size="lg">
            <a href="#programs">See Our Programs</a>
          </Button>
        </section>

        <Separator className="my-10" />

        <section id="pathway" className="space-y-4">
          <Badge variant="secondary" className="uppercase tracking-[0.2em]">
            Student-Athlete Pathway
          </Badge>
          <h2 className="text-2xl font-semibold">
            Assessment. Training. Competition. Academics.
          </h2>
          <p className="text-muted-foreground">
            A clear path to excellence on the court and beyond.
          </p>
        </section>

        <Separator className="my-10" />

        <section id="coaches" className="space-y-6">
          <h2 className="text-2xl font-semibold">Coaches</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <Badge variant="outline">Coaching Director</Badge>
                <CardTitle>Ryan Garreth Dizer</CardTitle>
                <CardDescription>BWF Accredited Coach</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="space-y-1">
                  <p>Bachelor of Physical Education</p>
                  <p>University of the Philippines, Diliman</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    Coaching Career
                  </p>
                  <p>Montessori Integrated School of Antipolo</p>
                  <p>Roots Academy</p>
                  <p>St. Clare</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Badge variant="outline">Head Coach</Badge>
                <CardTitle>Reinald Greg Dizer</CardTitle>
                <CardDescription>BWF Accredited Coach</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Bachelor of Science, Physical Therapy</p>
                <p>University of Sto. Tomas</p>
                <p>Registered Physiotherapist</p>
                <p>Physiotherapist in Singapore, 2016-2018</p>
                <p>Strength and Conditioning Coach</p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator className="my-10" />

        <section id="partners" className="space-y-6">
          <h2 className="text-2xl font-semibold">School Partners</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["Logo 1", "Logo 2", "Logo 3", "Logo 4"].map((label) => (
              <Card key={label} className="border-dashed text-center">
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">
                    {label}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="my-10" />

        <section id="programs" className="space-y-6">
          <h2 className="text-2xl font-semibold">Programs</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {programs.map((program) => (
              <Card key={program.title}>
                <CardHeader>
                  <CardTitle>{program.title}</CardTitle>
                  <CardDescription>{program.text}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <Separator className="my-10" />

        <section id="enroll" className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Enroll</h2>
            <p className="text-muted-foreground">
              Registration Form (static placeholder)
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Registration Form</CardTitle>
              <CardDescription>
                Share your details and we will follow up.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Full Name</label>
                <Input placeholder="Enter name" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" placeholder="Enter email" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">
                  Program of Interest
                </label>
                <Input
                  placeholder="Junior Development, High-Performance..."
                  className="mt-2"
                />
              </div>
              <Button type="button" className="w-full">
                Submit Registration
              </Button>
            </CardContent>
          </Card>
        </section>

        <Separator className="my-10" />

        <section id="badminton-district" className="space-y-8">
          <div id="district-about" className="space-y-3">
            <h2 className="text-2xl font-semibold">Badminton District</h2>
            <p className="text-muted-foreground">
              Badminton District is a facility offering three badminton courts
              designed to support structured training, competitive play, and
              corporate-level events.
            </p>
            <p className="text-muted-foreground">
              The venue serves athletes, institutions, schools, and
              organizations seeking a disciplined, safe, and
              performance-oriented badminton environment.
            </p>
            <div className="flex flex-wrap items-center gap-6">
              {venueLogos.map((logo) => (
                <div
                  key={logo.src}
                  className="flex items-center rounded-lg border bg-card px-4 py-2"
                >
                  <Image
                    src={logo.src}
                    alt={logo.alt}
                    width={120}
                    height={60}
                    className="h-10 w-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card id="courts">
              <CardHeader>
                <CardTitle>Courts and Amenities</CardTitle>
                <CardDescription>
                  Three indoor courts, clean facilities, and event-ready spaces
                  for structured training and corporate functions.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card id="packages">
              <CardHeader>
                <CardTitle>Event Packages</CardTitle>
                <CardDescription>
                  Tailored options for tournaments, corporate activities, school
                  programs, and private functions.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card id="rules">
              <CardHeader>
                <CardTitle>Rules and Guidelines</CardTitle>
                <CardDescription>
                  Safety, professionalism, and service quality for all guests.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Rules, Guidelines & Disclaimer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Only proper non-marking indoor badminton shoes are allowed on
                court.
              </p>
              <p>Court usage must strictly adhere to confirmed booking times.</p>
              <p>All players and guests must observe professional conduct.</p>
              <p>
                Respect for fellow players, coaches, staff, and officials is
                mandatory.
              </p>
              <p>
                Care and proper use of courts, equipment, and facilities are
                required.
              </p>
              <p>
                Food, beverages, and chewing gum are strictly prohibited inside
                playing areas.
              </p>
              <p>
                Any form of unsportsmanlike, disruptive, or unsafe behavior will
                not be tolerated.
              </p>
              <p>
                Badminton training conducted within the facility is exclusive
                to Dizer Badminton Academy.
              </p>
              <p>
                Training, coaching, or organized instruction by external
                coaches, trainers, or clubs is strictly not permitted.
              </p>
            </CardContent>
          </Card>
        </section>

        <Separator className="my-10" />

        <section id="contact" className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold">
                Contact Dizer Badminton Academy
              </h2>
              <p className="text-muted-foreground">
                We’d love to hear from you! Whether you’re an aspiring athlete,
                parent, partner, or corporate client, our team is ready to
                assist you.
              </p>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Get in Touch</CardTitle>
                <CardDescription>
                  📧 Email: <span className="text-muted-foreground">—</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>📱 Phone: +63 9272222657</p>
                <p className="font-semibold text-foreground">Visit Us</p>
                <p>Dizer Badminton Academy, Inc.</p>
                <p>Operating inside Badminton District</p>
                <p>Block 1 Lot 2 Loresville Drive, Lores Farm Subdivision</p>
                <p>Barangay San Roque, Antipolo</p>
                <p className="text-muted-foreground">(Map)</p>
                <p className="font-semibold text-foreground">Social Media</p>
                <p>Facebook | Instagram | Tiktok</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Send a Message</CardTitle>
              <CardDescription>
                We aim to respond within 24–48 hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input placeholder="Your name" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" placeholder="you@email.com" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Phone (optional)</label>
                <Input type="tel" placeholder="+63..." className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Message</label>
                <Textarea rows={4} placeholder="How can we help?" className="mt-2" />
              </div>
              <Button type="button" className="w-full">
                Submit
              </Button>
              <p className="text-xs text-muted-foreground">
                Thank you for reaching out!
              </p>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-10">
        <div className="mx-auto w-full max-w-6xl px-6 text-sm text-muted-foreground">
          Dizer Badminton Academy, Inc. — Corporate Badminton Training & Athlete
          Development | Operating at Badminton District | © 2026 All Rights
          Reserved
        </div>
      </footer>
    </div>
  );
}
