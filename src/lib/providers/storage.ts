import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";

/**
 * File storage for thumbnails, lesson PDFs and assignment files.
 *  - local:    ./storage/uploads (development only — serverless disks are ephemeral)
 *  - supabase: Supabase Storage via REST with the service-role key (server only)
 * Private files are always streamed through authorised API routes.
 */
export const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const MAX_UPLOAD_BYTES = { image: 5 * 1024 * 1024, document: 25 * 1024 * 1024, video: 2 * 1024 * 1024 * 1024 };

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "application/zip", ext: "zip", test: (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) },
];

/** Detects the real file type from magic bytes — never trust the client-provided MIME type. */
export function sniffMime(buf: Buffer): { mime: string; ext: string } | null {
  const hit = SIGNATURES.find((s) => buf.length >= 12 && s.test(buf));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

export function validateUpload(buf: Buffer, allowed: string[], maxBytes: number): { mime: string; ext: string } {
  if (buf.length === 0) throw new Error("The file is empty.");
  if (buf.length > maxBytes) throw new Error(`File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`);
  const sniff = sniffMime(buf);
  if (!sniff || !allowed.includes(sniff.mime)) throw new Error(`Unsupported file type. Allowed: ${allowed.join(", ")}`);
  return sniff;
}

function safeKey(prefix: string, ext: string) {
  return `${prefix.replace(/[^a-z0-9/_-]/gi, "")}/${new Date().toISOString().slice(0, 7)}/${randomToken(16)}.${ext}`;
}

async function supabaseStorage(method: string, bucket: string, key: string, body?: Buffer, contentType?: string) {
  const e = env();
  const res = await fetch(`${e.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${bucket}/${key}`, {
    method,
    headers: {
      Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: e.SUPABASE_SERVICE_ROLE_KEY,
      ...(contentType ? { "Content-Type": contentType, "x-upsert": "false" } : {}),
    },
    body: body ? new Uint8Array(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Storage ${method} failed: ${res.status}`);
  return res;
}

export async function putFile(visibility: "public" | "private", prefix: string, buf: Buffer, mime: string, ext: string) {
  const key = safeKey(prefix, ext);
  const e = env();
  if (e.STORAGE_PROVIDER === "supabase") {
    const bucket = visibility === "public" ? e.SUPABASE_STORAGE_BUCKET_PUBLIC : e.SUPABASE_STORAGE_BUCKET_PRIVATE;
    await supabaseStorage("POST", bucket, key, buf, mime);
    const publicUrl = visibility === "public" ? `${e.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}` : null;
    return { provider: "supabase" as const, key, publicUrl };
  }
  const full = path.join(STORAGE_ROOT, "uploads", visibility, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  return { provider: "local" as const, key, publicUrl: visibility === "public" ? `/api/files/public/${key}` : null };
}

export async function readFileFromStorage(provider: string, visibility: "public" | "private", key: string): Promise<Buffer> {
  if (key.includes("..")) throw new Error("invalid key");
  if (provider === "supabase") {
    const e = env();
    const bucket = visibility === "public" ? e.SUPABASE_STORAGE_BUCKET_PUBLIC : e.SUPABASE_STORAGE_BUCKET_PRIVATE;
    return Buffer.from(await (await supabaseStorage("GET", bucket, key)).arrayBuffer());
  }
  return readFile(path.join(STORAGE_ROOT, "uploads", visibility, key));
}

export async function fileExists(p: string) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}
