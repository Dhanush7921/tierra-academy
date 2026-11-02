import { z } from "zod";

export const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
export const password = z.string().min(10, "Use at least 10 characters.").max(128)
  .regex(/[A-Za-z]/, "Include at least one letter.").regex(/[0-9]/, "Include at least one number.");
export const fullName = z.string().trim().min(2, "Enter your name.").max(120);
export const uuid = z.string().uuid();

export const registerSchema = z.object({ fullName, email, password, accept: z.literal("on", { errorMap: () => ({ message: "Please accept the terms and privacy policy." }) }) });
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password.").max(128) });
export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120), email, topic: z.enum(["general", "courses", "payments", "partnership", "support"]).default("general"),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(4000), website: z.string().max(0).optional(), // honeypot
});
export const courseCreateSchema = z.object({
  title: z.string().trim().min(3).max(160), subtitle: z.string().trim().max(240).default(""), categoryId: uuid,
  delivery: z.enum(["RECORDED", "LIVE", "HYBRID"]), level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
});
const lines = z.string().max(4000).transform((s) => s.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 20));
const optDate = z.string().optional().transform((s) => (s ? new Date(s) : null));
const optInt = (min: number, max: number) => z.string().optional().transform((s) => (s ? Math.min(max, Math.max(min, parseInt(s, 10) || 0)) : null));
export const courseDetailsSchema = z.object({
  title: z.string().trim().min(3).max(160), subtitle: z.string().trim().max(240), description: z.string().trim().max(10000),
  requirements: lines, outcomes: lines, category_id: uuid, level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  delivery: z.enum(["RECORDED", "LIVE", "HYBRID"]), language: z.string().trim().max(40).default("English"),
  estimated_hours: z.coerce.number().min(0).max(1000), instructor_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  certificate_enabled: z.string().optional().transform((v) => v === "on"), enrollment_open: z.string().optional().transform((v) => v === "on"),
  min_attendance_percent: z.coerce.number().int().min(0).max(100), enrollment_capacity: optInt(1, 100000), access_days: optInt(1, 3650),
  enrollment_starts_at: optDate, enrollment_ends_at: optDate,
});
export const pricingSchema = z.object({
  isFree: z.string().optional().transform((v) => v === "on"),
  price: z.coerce.number().min(0).max(1_000_000), compareAt: z.string().optional().transform((s) => (s ? Math.round(Number(s) * 100) : null)),
}).refine((p) => p.isFree || p.price >= 1, { message: "Paid courses need a price of at least ₹1.", path: ["price"] });
export const lessonSchema = z.object({
  title: z.string().trim().min(2).max(200), summary: z.string().trim().max(500).default(""), body: z.string().max(50000).default(""),
  kind: z.enum(["VIDEO", "ARTICLE", "LIVE", "QUIZ", "ASSIGNMENT"]), duration_seconds: z.coerce.number().int().min(0).max(36000),
  is_preview: z.string().optional().transform((v) => v === "on"), is_required: z.string().optional().transform((v) => v === "on"),
  video_asset_id: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
});
export const liveSchema = z.object({
  courseId: uuid, title: z.string().trim().min(3).max(200), description: z.string().trim().max(2000).default(""),
  startsAt: z.string().min(1).transform((s) => new Date(s)).refine((d) => !isNaN(d.getTime()) && d.getTime() > Date.now() - 60_000, "Choose a future date/time."),
  durationMinutes: z.coerce.number().int().min(10).max(600), hostId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
});
export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, "3–32 letters, numbers, - or _"), kind: z.enum(["PERCENT", "FLAT"]),
  value: z.coerce.number().positive(), courseId: z.string().uuid().optional().or(z.literal("")).transform((v) => v || null),
  maxRedemptions: optInt(1, 1_000_000), validUntil: optDate,
}).refine((c) => c.kind !== "PERCENT" || c.value <= 100, { message: "Percent must be ≤ 100", path: ["value"] });
export const quizSchema = z.object({ title: z.string().trim().min(2).max(200), passPercent: z.coerce.number().int().min(1).max(100), maxAttempts: optInt(1, 100), isRequired: z.string().optional().transform((v) => v === "on") });
export const questionSchema = z.object({
  prompt: z.string().trim().min(3).max(1000), options: z.string().transform((s) => s.split("\n").map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string().max(300)).min(2).max(8)),
  correctIndex: z.coerce.number().int().min(0), explanation: z.string().trim().max(1000).default(""),
}).refine((q) => q.correctIndex < q.options.length, { message: "Correct option out of range", path: ["correctIndex"] });
export const assignmentSchema = z.object({
  title: z.string().trim().min(3).max(200), instructions: z.string().trim().max(10000).default(""), dueAt: optDate,
  maxPoints: z.coerce.number().int().min(1).max(1000), passPoints: z.coerce.number().int().min(0).max(1000), isRequired: z.string().optional().transform((v) => v === "on"),
});

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string> } | undefined;

export function zodErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[i.path.join(".") || "_"] ??= i.message;
  return out;
}
