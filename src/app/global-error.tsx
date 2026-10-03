"use client";

/** Last-resort boundary (root layout failed). Plain markup; no error details shown. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div role="alert" style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 18 }}>Project data is temporarily unavailable</h1>
          <p style={{ color: "#555", fontSize: 14 }}>Please try again in a moment.</p>
          {error.digest ? <p style={{ color: "#777", fontSize: 12 }}>Reference: {error.digest}</p> : null}
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "8px 16px" }}>
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
