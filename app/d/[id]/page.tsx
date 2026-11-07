"use client";

import {
  Suspense,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useParams } from "next/navigation";

type Drop = {
  id: string;
  type: "text" | "link";
  content?: string;
  expiresAt: string;
};

function DropPageContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [drop, setDrop] = useState<Drop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [accessSessionId, setAccessSessionId] = useState("");

  // Create one access session per browser tab.
  useEffect(() => {
    const storageKey = `dropnexa-access-${id}`;

    try {
      let sessionId = sessionStorage.getItem(storageKey);

      if (!sessionId || !/^[a-f0-9]{32}$/i.test(sessionId)) {
        sessionId = crypto.randomUUID().replace(/-/g, "");
        sessionStorage.setItem(storageKey, sessionId);
      }

      setAccessSessionId(sessionId);
    } catch (err) {
      console.error("Access session initialization failed:", err);
      setError("Unable to initialize your access session.");
      setLoading(false);
    }
  }, [id]);

  // Retrieve drop after session initialization.
  useEffect(() => {
    if (!id || !accessSessionId) return;

    let cancelled = false;

    async function fetchDrop() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(`/api/drops/${id}`, {
          cache: "no-store",
          headers: {
            "x-drop-access-session": accessSessionId,
          },
        });

        const data = await response.json();

        if (cancelled) return;

        if (!response.ok || !data.success) {
          setError(data.message || "Unable to open this drop.");
          return;
        }

        setDrop(data.drop);
        setPasswordRequired(data.passwordRequired === true);
      } catch (err) {
        if (cancelled) return;

        console.error("Drop retrieval failed:", err);
        setError("Something went wrong. Please try again.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDrop();

    return () => {
      cancelled = true;
    };
  }, [id, accessSessionId]);

  async function unlockDrop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!password.trim() || unlocking || !accessSessionId) return;

    setUnlocking(true);
    setUnlockError("");

    try {
      const response = await fetch(`/api/drops/${id}/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-drop-access-session": accessSessionId,
        },
        body: JSON.stringify({ password }),
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setUnlockError(data.message || "Unable to unlock this drop.");
        return;
      }

      setDrop(data.drop);
      setPasswordRequired(false);
      setPassword("");
    } catch (err) {
      console.error("Drop unlock failed:", err);
      setUnlockError("Something went wrong. Please try again.");
    } finally {
      setUnlocking(false);
    }
  }

  async function copyContent() {
    if (!drop?.content) return;

    try {
      await navigator.clipboard.writeText(drop.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Unable to copy content. Please copy it manually.");
    }
  }

  const styles = {
    main: {
      minHeight: "100vh",
      width: "100%",
      boxSizing: "border-box" as const,
      background: "#101010",
      color: "#ffffff",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "48px 20px",
      fontFamily: "Arial, sans-serif",
    },
    wrapper: {
      width: "100%",
      maxWidth: "680px",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "40px",
      gap: "16px",
    },
    logo: {
      fontSize: "27px",
      fontWeight: 800,
      color: "#ffffff",
      textDecoration: "none",
      letterSpacing: "-1px",
    },
    card: {
      background: "#171717",
      border: "1px solid #303030",
      borderRadius: "18px",
      padding: "clamp(22px, 5vw, 40px)",
      boxSizing: "border-box" as const,
      boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    },
    label: {
      color: "#ff7a36",
      fontSize: "12px",
      letterSpacing: "2px",
      textTransform: "uppercase" as const,
      marginBottom: "10px",
    },
    heading: {
      fontSize: "clamp(26px, 5vw, 34px)",
      fontWeight: 700,
      margin: 0,
    },
    content: {
      background: "#101010",
      border: "1px solid #303030",
      borderRadius: "12px",
      padding: "24px",
      margin: "28px 0 22px",
      color: "#e5e5e5",
      lineHeight: 1.8,
      overflowWrap: "anywhere" as const,
      whiteSpace: "pre-wrap" as const,
    },
    button: {
      flex: 1,
      minWidth: "130px",
      border: "none",
      borderRadius: "9px",
      padding: "15px 20px",
      background: "#ff7a36",
      color: "#111111",
      fontWeight: 700,
      fontSize: "14px",
      cursor: "pointer",
      textAlign: "center" as const,
      textDecoration: "none",
      boxSizing: "border-box" as const,
    },
    passwordInput: {
      width: "100%",
      boxSizing: "border-box" as const,
      background: "#101010",
      border: "1px solid #383838",
      borderRadius: "9px",
      padding: "15px 16px",
      color: "#ffffff",
      fontSize: "15px",
      outline: "none",
      marginTop: "12px",
      marginBottom: "18px",
    },
    footer: {
      borderTop: "1px solid #303030",
      marginTop: "30px",
      paddingTop: "22px",
      display: "flex",
      justifyContent: "space-between",
      flexWrap: "wrap" as const,
      gap: "12px",
      color: "#777777",
      fontSize: "12px",
    },
  };

  return (
    <main style={styles.main}>
      <section style={styles.wrapper}>
        <header style={styles.header}>
          <a href="/" style={styles.logo}>
            Drop<span style={{ color: "#ff7a36" }}>Nexa</span>
          </a>

          <span style={{ color: "#777", fontSize: "12px" }}>
            SHARE WITHOUT LIMITS
          </span>
        </header>

        <div style={styles.card}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "70px 0" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  border: "3px solid #ff7a36",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  margin: "0 auto 20px",
                  animation: "dropSpin 0.8s linear infinite",
                }}
              />
              <p style={{ color: "#999" }}>Retrieving your drop...</p>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "45px 0" }}>
              <h1 style={{ fontSize: "26px" }}>Drop unavailable</h1>
              <p style={{ color: "#999", lineHeight: 1.7 }}>{error}</p>

              <a
                href="/"
                style={{
                  ...styles.button,
                  display: "inline-block",
                  maxWidth: "200px",
                  marginTop: "20px",
                }}
              >
                Go to DropNexa
              </a>
            </div>
          ) : passwordRequired ? (
            <div style={{ padding: "25px 0" }}>
              <div style={{ textAlign: "center", marginBottom: "30px" }}>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "18px",
                    background: "rgba(255,122,54,0.12)",
                    border: "1px solid rgba(255,122,54,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "27px",
                    margin: "0 auto 24px",
                  }}
                >
                  ◈
                </div>

                <p style={styles.label}>Password protected</p>

                <h1 style={styles.heading}>
                  This drop is locked.
                </h1>

                <p
                  style={{
                    color: "#999",
                    lineHeight: 1.7,
                    marginTop: "14px",
                    fontSize: "14px",
                  }}
                >
                  The sender has protected this drop.
                  Enter the password they shared with you to access its contents.
                </p>
              </div>

              <form onSubmit={unlockDrop}>
                <label
                  htmlFor="drop-unlock-password"
                  style={{
                    color: "#bbbbbb",
                    fontSize: "12px",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  Enter password
                </label>

                <input
                  id="drop-unlock-password"
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setUnlockError("");
                  }}
                  placeholder="Enter the drop password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                  style={styles.passwordInput}
                />

                {unlockError && (
                  <p
                    role="alert"
                    style={{
                      color: "#ff7777",
                      fontSize: "13px",
                      marginTop: "-5px",
                      marginBottom: "18px",
                    }}
                  >
                    {unlockError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={unlocking || !password.trim()}
                  style={{
                    ...styles.button,
                    width: "100%",
                    opacity: unlocking || !password.trim() ? 0.6 : 1,
                  }}
                >
                  {unlocking ? "Verifying password..." : "Unlock Drop →"}
                </button>
              </form>

              <p
                style={{
                  textAlign: "center",
                  color: "#666",
                  fontSize: "12px",
                  marginTop: "24px",
                }}
              >
                Your content stays hidden until verification succeeds.
              </p>
            </div>
          ) : drop?.content !== undefined ? (
            <>
              <div style={{ marginBottom: "25px" }}>
                <p style={styles.label}>Shared with you</p>

                <h1 style={styles.heading}>
                  {drop.type === "text" ? "TextDrop" : "LinkDrop"}
                </h1>
              </div>

              <div style={styles.content}>
                {drop.type === "text" ? (
                  drop.content
                ) : (
                  <a
                    href={drop.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#ff925c" }}
                  >
                    {drop.content}
                  </a>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <button onClick={copyContent} style={styles.button}>
                  {copied ? "Copied!" : "Copy Content"}
                </button>

                {drop.type === "link" && (
                  <a
                    href={drop.content}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...styles.button,
                      background: "#252525",
                      color: "#ffffff",
                      border: "1px solid #444",
                    }}
                  >
                    Open Link
                  </a>
                )}
              </div>

              <div style={styles.footer}>
                <span>
                  Expires: {new Date(drop.expiresAt).toLocaleString()}
                </span>

                <span>Shared using DropNexa</span>
              </div>
            </>
          ) : null}
        </div>

        <p
          style={{
            textAlign: "center",
            color: "#666",
            fontSize: "12px",
            marginTop: "25px",
          }}
        >
          Simple. Fast. Reliable file sharing.
        </p>
      </section>

      <style jsx global>{`
        @keyframes dropSpin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}

export default function DropPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            background: "#101010",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Arial, sans-serif",
            padding: "20px",
          }}
        >
          <p style={{ color: "#999" }}>Loading DropNexa...</p>
        </main>
      }
    >
      <DropPageContent />
    </Suspense>
  );
}