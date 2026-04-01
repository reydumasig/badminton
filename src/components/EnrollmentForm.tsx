"use client";

import { useState } from "react";
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

const schema = z.object({
  name: z.string().min(2, "Please enter your full name."),
  email: z.string().email("Please enter a valid email address."),
  program: z.string().min(1, "Please select a program."),
});

type FormData = z.infer<typeof schema>;

const programOptions = [
  "Junior Development",
  "High-Performance",
  "Sponsored Athletes",
  "Corporate and Adult Training",
];

type Status = "idle" | "loading" | "success" | "error";

export default function EnrollmentForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json();

      if (!res.ok) {
        setErrorMessage(json.error || "Submission failed. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
      reset();
    } catch {
      setErrorMessage("Network error. Please check your connection.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CardHeader>
          <CardTitle className="text-green-800 dark:text-green-200">
            Registration Received!
          </CardTitle>
          <CardDescription className="text-green-700 dark:text-green-300">
            Thank you for your interest in Dizer Badminton Academy. We'll reach
            out to you within 24–48 hours to discuss next steps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="border-green-300 text-green-800 hover:bg-green-100 dark:border-green-700 dark:text-green-300"
            onClick={() => setStatus("idle")}
          >
            Submit another registration
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registration Form</CardTitle>
        <CardDescription>
          Share your details and we will follow up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium">
              Full Name <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="Enter your full name"
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
              Program of Interest <span className="text-destructive">*</span>
            </label>
            <select
              className="mt-2 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              {...register("program")}
              defaultValue=""
            >
              <option value="" disabled>
                Select a program…
              </option>
              {programOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {errors.program && (
              <p className="mt-1 text-xs text-destructive">
                {errors.program.message}
              </p>
            )}
          </div>

          {status === "error" && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {errorMessage}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={status === "loading"}
          >
            {status === "loading" ? "Submitting…" : "Submit Registration"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
