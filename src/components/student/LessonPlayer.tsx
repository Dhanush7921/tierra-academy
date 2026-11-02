"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPath } from "@/lib/paths";
import { Alert } from "@/components/ui/primitives";

type Playback = { kind: "iframe" | "file"; src: string; expiresAt: number; captions: { src: string; lang: string; label: string }[]; resumeAt: number; durationSeconds: number };
type StreamPlayer = { currentTime: number; duration: number; playbackRate: number; addEventListener: (e: string, f: () => void) => void };

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * Secure lesson player.
 *  - Playback URLs are short-lived and user-bound (fetched from the server after an enrollment check).
 *  - "watched" time only accumulates during continuous playback, so seeking to the end cannot fake completion.
 *  - Resume position, playback speed and captions are supported.
 */
export function LessonPlayer({ lessonId, onCompleted }: { lessonId: string; onCompleted?: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pb, setPb] = useState<Playback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [done, setDone] = useState(false);
  const watched = useRef(0);
  const lastT = useRef(0);
  const resumed = useRef(false);

  const load = useCallback(async () => {
    const r = await fetch(apiPath(`/videos/playback/${lessonId}`), { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setError(j.error ?? "This video is not available."); return; }
    setPb(j);
  }, [lessonId]);

  useEffect(() => { resumed.current = false; watched.current = 0; setDone(false); setError(null); load(); }, [load]);

  const beat = useCallback(async (position: number, ended = false) => {
    const delta = Math.round(watched.current);
    watched.current -= delta;
    const r = await fetch(apiPath("/progress"), { method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ lessonId, positionSeconds: Math.floor(position), watchedDelta: delta, ended }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (j?.completed && !done) { setDone(true); onCompleted?.(); }
  }, [lessonId, done, onCompleted]);

  const onTime = (t: number) => {
    const d = t - lastT.current;
    if (d > 0 && d < 2.5) watched.current += d; // seconds of content actually played (seeks are ignored)
    lastT.current = t;
  };

  // native <video> wiring
  useEffect(() => {
    const v = videoRef.current;
    if (!v || pb?.kind !== "file") return;
    const timer = setInterval(() => { if (!v.paused) beat(v.currentTime); }, 10_000);
    const onPause = () => beat(v.currentTime);
    const onEnded = () => beat(v.duration, true);
    const onMeta = () => {
      if (!resumed.current && pb.resumeAt > 3 && pb.resumeAt < v.duration - 5) v.currentTime = pb.resumeAt;
      resumed.current = true;
      lastT.current = v.currentTime;
    };
    const onErr = () => { const t = v.currentTime; load().then(() => { if (videoRef.current) videoRef.current.currentTime = t; }); };
    const onTu = () => onTime(v.currentTime);
    v.addEventListener("timeupdate", onTu);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    return () => { clearInterval(timer); v.removeEventListener("timeupdate", onTu); v.removeEventListener("pause", onPause); v.removeEventListener("ended", onEnded); v.removeEventListener("loadedmetadata", onMeta); v.removeEventListener("error", onErr); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pb, beat, load]);

  useEffect(() => { if (videoRef.current) videoRef.current.playbackRate = speed; }, [speed]);

  // Cloudflare Stream iframe wiring (Player SDK)
  useEffect(() => {
    if (pb?.kind !== "iframe" || !iframeRef.current) return;
    let player: StreamPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    const s = document.createElement("script");
    s.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
    s.onload = () => {
      const Stream = (window as unknown as { Stream?: (el: HTMLIFrameElement) => StreamPlayer }).Stream;
      if (!Stream || !iframeRef.current) return;
      player = Stream(iframeRef.current);
      player.addEventListener("timeupdate", () => onTime(player!.currentTime));
      player.addEventListener("ended", () => beat(player!.duration, true));
      player.addEventListener("pause", () => beat(player!.currentTime));
      player.addEventListener("loadedmetadata", () => { if (pb.resumeAt > 3) player!.currentTime = pb.resumeAt; });
      timer = setInterval(() => player && beat(player.currentTime), 10_000);
    };
    document.body.appendChild(s);
    return () => { clearInterval(timer); s.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pb]);

  if (error) return <Alert tone="warn">{error}</Alert>;
  if (!pb) return <div className="skeleton aspect-video w-full" aria-label="Loading video" />;

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl bg-black shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)]">
        {pb.kind === "file" ? (
          <video ref={videoRef} src={pb.src} controls playsInline preload="metadata" controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} className="aspect-video w-full">
            {pb.captions.map((c, i) => <track key={c.lang} kind="captions" src={c.src} srcLang={c.lang} label={c.label} default={i === 0} />)}
          </video>
        ) : (
          <iframe ref={iframeRef} src={pb.src} title="Lesson video" className="aspect-video w-full" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        {pb.kind === "file" ? (
          <label className="flex items-center gap-2">Speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-lg border border-line-strong bg-surface px-2 py-1 text-fg">
              {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
          </label>
        ) : <span>Speed & captions are in the player menu.</span>}
        <span>{done ? "✓ Lesson completed" : "Progress saves automatically"}</span>
      </div>
    </div>
  );
}
