"use client";
/**
 * Letters to the editor — the enquiry form.
 *
 * Posts to /api/contact → Resend. The spam defences live server-side (honeypot, minimum fill time,
 * length caps); this page supplies the two things only the browser knows: the honeypot field and the
 * moment the form was opened. Name and email are optional — the email only matters if a reply is
 * wanted, and asking for one to file a complaint would be its own kind of rudeness.
 */
import { useRef, useState } from "react";
import { Button, ButtonLink, Dateline, Masthead, cx, styles } from "@/ui";

type SendState = "idle" | "sending" | "sent" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — visually hidden, humans never fill it
  const [state, setState] = useState<SendState>("idle");
  const [error, setError] = useState("");
  const openedAt = useRef(Date.now());

  async function send(): Promise<void> {
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          message,
          website,
          startedAt: openedAt.current,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Sending failed — please try again.");
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
      setState("error");
    }
  }

  return (
    <main className={styles.page}>
      <Masthead slug="Letters" back="/" />
      <Dateline left="Letters to the editor" right="Every one is read" />

      <div className={styles.gutter}>
        {state === "sent" ? (
          <>
            <h1 style={{ fontSize: 34, marginTop: 20 }}>
              Filed.
              <br />
              <span className={styles.hedRed}>Thank you.</span>
            </h1>
            <p className={styles.standfirst}>
              Thanks for writing in{name.trim() ? `, ${name.trim()}` : ""}.
              {email.trim()
                ? " I'll reply to your email."
                : " Add an email next time if you'd like a reply."}
            </p>
            <ButtonLink href="/" kind="ink" style={{ marginTop: 18 }}>
              Back to the app
            </ButtonLink>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 34, marginTop: 20 }}>
              Letters to
              <br />
              <span className={styles.hedRed}>the editor.</span>
            </h1>
            <p className={styles.standfirst}>
              Questions, ideas, or something not working? It goes straight to the developer — no
              account, no ticket number.
            </p>

            <div style={{ marginTop: 20 }}>
              <label>
                <span className={styles.label}>Your name (optional)</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  style={{ marginTop: 6 }}
                />
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              <label>
                <span className={styles.label}>Your email (only if you want a reply)</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  style={{ marginTop: 6 }}
                />
              </label>
            </div>

            <div style={{ marginTop: 14 }}>
              <label>
                <span className={styles.label}>Message</span>
                <textarea
                  rows={6}
                  maxLength={6000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  style={{ marginTop: 6, minHeight: 130, padding: "10px 12px", resize: "vertical" }}
                />
              </label>
            </div>

            {/* Honeypot — off-screen for humans, irresistible to bots. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
            />

            {error && (
              <div
                className={cx(styles.box, styles.boxThin)}
                role="alert"
                style={{ marginTop: 14, borderColor: "var(--red)", color: "var(--red)", fontWeight: 700 }}
              >
                {error}
              </div>
            )}

            <Button
              kind="red"
              onClick={() => void send()}
              disabled={state === "sending" || message.trim().length === 0}
              style={{ marginTop: 18 }}
            >
              {state === "sending" ? "Sending…" : "Send the letter"}
            </Button>
            <p className={cx(styles.note, styles.noteNormal)} style={{ marginTop: 10 }}>
              No account needed. Your message goes to the developer and nowhere else.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
