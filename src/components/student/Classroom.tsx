"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiPath } from "@/lib/paths";
import { Alert, Avatar, Badge, Card, buttonClass, cx } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime } from "@/lib/format";

type Session = { id: string; title: string; courseTitle: string; startsAt: string; durationMinutes: number; status: string };
type Msg = { id: number; body: string; created_at: string; full_name: string; user_id: string };
type ZoomCfg = { signature: string; sdkKey: string; meetingNumber: string; passcode: string; userName: string; userEmail: string };

/**
 * Live classroom.
 *  - mode "zoom": embeds the Zoom Meeting SDK (Component View). Signature is generated server-side.
 *  - mode "demo": SIMULATED classroom — your own camera/mic/screen are previewed locally only;
 *    chat and attendance are real (stored in the DB) but there is NO audio/video conference.
 */
export function Classroom({ mode, sessionId, session, user, isHost, zoom, joinUrl }: {
  mode: "demo" | "zoom"; sessionId: string; session: Session; user: { id: string; name: string }; isHost: boolean; zoom?: ZoomCfg; joinUrl?: string;
}) {
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState(session.status);

  // attendance heartbeat while in the room
  useEffect(() => {
    if (!joined) return;
    const beat = (leaving = false) => fetch(apiPath(`/live/${sessionId}/heartbeat`), { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leaving }) }).catch(() => {});
    beat();
    const t = setInterval(() => beat(), 30_000);
    const onHide = () => beat(true);
    window.addEventListener("pagehide", onHide);
    return () => { clearInterval(t); window.removeEventListener("pagehide", onHide); beat(true); };
  }, [joined, sessionId]);

  const setLive = async (s: "LIVE" | "ENDED") => {
    const r = await fetch(apiPath(`/live/${sessionId}/status`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
    if (r.ok) setStatus(s);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label-mono">{session.courseTitle}</p>
          <h1 className="font-display text-2xl font-semibold">{session.title}</h1>
          <p className="text-sm text-muted">{formatDateTime(session.startsAt)} · {session.durationMinutes} min</p>
        </div>
        <div className="flex items-center gap-2">
          {status === "LIVE" ? <Badge tone="danger">● Live</Badge> : <Badge tone="info">{status.toLowerCase()}</Badge>}
          {mode === "demo" && <Badge tone="warn">Demo classroom — not a real video conference</Badge>}
          {isHost && status === "SCHEDULED" && <button className={buttonClass("primary", "sm")} onClick={() => setLive("LIVE")}>Start class</button>}
          {isHost && status === "LIVE" && <button className={buttonClass("danger", "sm")} onClick={() => setLive("ENDED")}>End class</button>}
        </div>
      </div>
      {!joined ? (
        <Card strong className="grid place-items-center p-10 text-center">
          <div>
            <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--info)_16%,transparent)] text-info"><Icon name="video" size={28} /></span>
            <p className="mt-4 font-display text-lg font-semibold">Ready to join?</p>
            <p className="mt-1 max-w-md text-sm text-muted">{mode === "demo" ? "This demo room previews your own camera, microphone and screen locally and lets you chat with classmates. Nothing is broadcast." : "You'll join the Zoom meeting inside this page. Camera and microphone permission will be requested by your browser."}</p>
            <button className={buttonClass("primary", "lg", "mt-6")} onClick={() => setJoined(true)}>Join classroom</button>
          </div>
        </Card>
      ) : mode === "zoom" && zoom ? <ZoomRoom cfg={zoom} joinUrl={joinUrl!} onLeave={() => setJoined(false)} /> : <DemoRoom sessionId={sessionId} user={user} onLeave={() => setJoined(false)} />}
    </div>
  );
}

function ZoomRoom({ cfg, joinUrl, onLeave }: { cfg: ZoomCfg; joinUrl: string; onLeave: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let client: { leaveMeeting?: () => Promise<void> } | null = null;
    (async () => {
      try {
        const mod = await import("@zoom/meetingsdk/embedded");
        const ZoomMtgEmbedded = (mod as unknown as { default: { createClient: () => Record<string, (...a: unknown[]) => Promise<unknown>> } }).default;
        const c = ZoomMtgEmbedded.createClient();
        client = c as never;
        await c.init({ zoomAppRoot: el.current, language: "en-US", patchJsMedia: true, leaveOnPageUnload: true, customize: { video: { isResizable: true, viewSizes: { default: { width: 960, height: 540 } } } } });
        await c.join({ signature: cfg.signature, sdkKey: cfg.sdkKey, meetingNumber: cfg.meetingNumber, password: cfg.passcode, userName: cfg.userName, userEmail: cfg.userEmail });
      } catch (e) {
        setError(`Could not start the in-browser classroom (${(e as Error)?.message ?? "unknown error"}). Use the Zoom app link instead.`);
      }
    })();
    return () => { client?.leaveMeeting?.().catch(() => {}); };
  }, [cfg]);
  return (
    <div className="space-y-3">
      {error && <Alert tone="warn">{error} <a className="underline" href={joinUrl} target="_blank" rel="noopener noreferrer">Open Zoom</a></Alert>}
      <div ref={el} className="min-h-[540px] overflow-hidden rounded-2xl bg-black" />
      <button className={buttonClass("outline", "sm")} onClick={onLeave}>Leave</button>
    </div>
  );
}

function DemoRoom({ sessionId, user, onLeave }: { sessionId: string; user: { id: string; name: string }; onLeave: () => void }) {
  const camRef = useRef<HTMLVideoElement>(null);
  const screenRef = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [mic, setMic] = useState(false);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [people, setPeople] = useState<{ user_id: string; full_name: string }[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const lastId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    const r = await fetch(apiPath(`/live/${sessionId}/messages?after=${lastId.current}`), { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (j.messages.length) {
      lastId.current = j.messages[j.messages.length - 1].id;
      setMsgs((m) => [...m, ...j.messages].slice(-200));
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    }
    setPeople(j.participants);
  }, [sessionId]);

  useEffect(() => { poll(); const t = setInterval(poll, 3000); return () => clearInterval(t); }, [poll]);
  useEffect(() => () => { cam?.getTracks().forEach((t) => t.stop()); screen?.getTracks().forEach((t) => t.stop()); }, [cam, screen]);

  const toggleCam = async () => {
    if (cam) { cam.getTracks().forEach((t) => t.stop()); setCam(null); setMic(false); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      s.getAudioTracks().forEach((t) => (t.enabled = false));
      setCam(s);
      if (camRef.current) camRef.current.srcObject = s;
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      ctx.createMediaStreamSource(s).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      const tick = () => { if (!s.active) return ctx.close(); an.getByteFrequencyData(data); setLevel(data.reduce((a, b) => a + b, 0) / data.length / 128); requestAnimationFrame(tick); };
      tick();
    } catch { setErr("Camera/microphone permission was denied or no device is available."); }
  };
  const toggleMic = () => { if (!cam) return; const next = !mic; cam.getAudioTracks().forEach((t) => (t.enabled = next)); setMic(next); };
  const toggleScreen = async () => {
    if (screen) { screen.getTracks().forEach((t) => t.stop()); setScreen(null); return; }
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
      s.getVideoTracks()[0].addEventListener("ended", () => setScreen(null));
      setScreen(s);
      requestAnimationFrame(() => { if (screenRef.current) screenRef.current.srcObject = s; });
    } catch { /* user cancelled */ }
  };
  useEffect(() => { if (camRef.current && cam) camRef.current.srcObject = cam; }, [cam]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const r = await fetch(apiPath(`/live/${sessionId}/messages`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error ?? "Message not sent.");
    poll();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#05080f]">
          {screen ? <video ref={screenRef} autoPlay muted playsInline className="size-full object-contain" /> : (
            <div className="grid size-full place-items-center bg-blueprint text-center">
              <div><Icon name="monitor" size={40} className="mx-auto text-muted" /><p className="mt-3 text-sm text-muted">Instructor stage (simulated)</p><p className="text-xs text-muted">In production this area shows the Zoom meeting.</p></div>
            </div>
          )}
          <div className="absolute bottom-3 right-3 aspect-video w-48 overflow-hidden rounded-xl border border-white/10 bg-black shadow-xl">
            {cam ? <video ref={camRef} autoPlay muted playsInline className="size-full -scale-x-100 object-cover" /> : <div className="grid size-full place-items-center"><Avatar name={user.name} size={44} /></div>}
            <span className="absolute bottom-1 left-2 text-[10px] text-white/80">You {mic && <span className="ml-1 inline-block h-1.5 rounded bg-ok align-middle" style={{ width: 6 + level * 30 }} />}</span>
          </div>
        </div>
        <div className="glass flex flex-wrap items-center justify-center gap-2 rounded-2xl p-2">
          <button onClick={toggleCam} aria-pressed={Boolean(cam)} className={buttonClass(cam ? "secondary" : "outline", "md")}><Icon name="video" size={16} />{cam ? "Camera on" : "Camera off"}</button>
          <button onClick={toggleMic} disabled={!cam} aria-pressed={mic} className={buttonClass(mic ? "secondary" : "outline", "md")}><Icon name="mic" size={16} />{mic ? "Mic on" : "Mic muted"}</button>
          <button onClick={toggleScreen} aria-pressed={Boolean(screen)} className={buttonClass(screen ? "secondary" : "outline", "md")}><Icon name="monitor" size={16} />{screen ? "Stop sharing" : "Share screen"}</button>
          <button onClick={onLeave} className={buttonClass("danger", "md")}><Icon name="logout" size={16} />Leave</button>
        </div>
        {err && <Alert tone="warn">{err}</Alert>}
      </div>
      <Card className="flex h-[min(70vh,620px)] flex-col overflow-hidden">
        <div className="border-b border-line p-3"><p className="text-sm font-semibold">In the room ({people.length})</p>
          <div className="mt-2 flex -space-x-2">{people.slice(0, 8).map((p) => <span key={p.user_id} title={p.full_name} className="rounded-full ring-2 ring-[var(--surface)]"><Avatar name={p.full_name} size={28} /></span>)}</div>
        </div>
        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite" aria-label="Class chat">
          {msgs.length ? msgs.map((m) => (
            <div key={m.id} className={cx("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.user_id === user.id ? "ml-auto bg-[color-mix(in_srgb,var(--brand)_18%,transparent)]" : "bg-surface-2")}>
              <p className="text-[11px] font-semibold text-muted">{m.full_name}</p><p className="break-words">{m.body}</p>
            </div>
          )) : <p className="text-center text-sm text-muted">No messages yet — say hello 👋</p>}
        </div>
        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <label htmlFor="chat" className="sr-only">Message</label>
          <input id="chat" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Message the class…" className="h-10 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand" />
          <button className={buttonClass("primary", "md")} aria-label="Send"><Icon name="send" size={16} /></button>
        </form>
      </Card>
    </div>
  );
}
