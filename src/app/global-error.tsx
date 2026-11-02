"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", background: "#05080f", color: "#eef2f8", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1>Something went wrong</h1>
          <p style={{ opacity: 0.7 }}>Please try again.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "10px 18px", borderRadius: 12, border: 0, background: "#ff7a00", color: "#160a00", fontWeight: 700 }}>Retry</button>
        </div>
      </body>
    </html>
  );
}
