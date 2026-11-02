"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "@/lib/paths";
import { Alert, ProgressBar, buttonClass } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";

/**
 * Direct video upload with progress:
 *   1. server creates the asset + a one-time upload URL (Cloudflare Stream direct upload, or local dev target)
 *   2. browser uploads straight to that URL (XHR for progress events) — the app server never buffers the file in production
 *   3. status is polled until Cloudflare finishes processing
 */
export function VideoUploader({ courseId }: { courseId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);

  const probeDuration = (file: File) => new Promise<number>((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { resolve(Math.round(v.duration) || 0); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });

  const upload = async (file: File) => {
    setMsg(null);
    if (file.size > 4 * 1024 ** 3) return setMsg({ tone: "danger", text: "Files over 4 GB are not supported." });
    const duration = await probeDuration(file);
    const r = await fetch(apiPath("/videos/upload-url"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, filename: file.name, sizeBytes: file.size }) });
    const j = await r.json();
    if (!r.ok) return setMsg({ tone: "danger", text: j.error ?? "Could not start the upload." });
    setPct(0);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => e.lengthComputable && setPct((e.loaded / e.total) * 100);
    xhr.onerror = () => { setPct(null); setMsg({ tone: "danger", text: "Network error during upload. Please retry." }); };
    xhr.onload = async () => {
      setPct(null);
      if (xhr.status >= 300) return setMsg({ tone: "danger", text: `Upload failed (${xhr.status}). ${xhr.responseText.slice(0, 160)}` });
      if (duration) await fetch(apiPath(`/videos/${j.assetId}/status`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ durationSeconds: duration }) });
      setMsg({ tone: "info", text: "Uploaded. Processing…" });
      for (let i = 0; i < 60; i++) {
        const s = await (await fetch(apiPath(`/videos/${j.assetId}/status`), { cache: "no-store" })).json();
        if (s.status === "READY") { setMsg({ tone: "ok", text: "Video ready. Attach it to a lesson in the Curriculum tab." }); break; }
        if (s.status === "ERROR") { setMsg({ tone: "danger", text: `Processing failed: ${s.error_message ?? "unknown error"}` }); break; }
        await new Promise((res) => setTimeout(res, 5000));
      }
      router.refresh();
    };
    if (j.method === "POST_FORM") {
      const fd = new FormData();
      fd.append("file", file);
      xhr.open("POST", j.uploadUrl);
      xhr.send(fd);
    } else {
      xhr.open("PUT", j.uploadUrl);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.send(file);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong p-8 text-center transition hover:border-brand"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}>
        <Icon name="upload" size={28} className="text-brand" />
        <span className="font-semibold">Drop a lesson video here or click to choose</span>
        <span className="text-xs text-muted">MP4, MOV, MKV, M4V or WEBM · up to 4 GB · streamed privately</span>
        <input ref={input} type="file" accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.m4v" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} disabled={pct !== null} />
      </label>
      {pct !== null && <div><ProgressBar value={pct} label="Upload progress" /><p className="mt-1 text-xs text-muted">{Math.round(pct)}% uploaded</p></div>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {pct !== null && <button type="button" className={buttonClass("ghost", "sm")} onClick={() => location.reload()}>Cancel</button>}
    </div>
  );
}
