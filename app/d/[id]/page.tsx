
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Drop = {
  id: string;
  type: "text" | "link";
  content: string;
  expiresAt: string;
};

export default function DropPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [drop, setDrop] = useState<Drop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchDrop() {
      try {
        const response = await fetch(`/api/drops/${id}`, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.message || "Unable to open this drop.");
          return;
        }

        setDrop(data.drop);
      } catch (err) {
        console.error("Drop retrieval failed:", err);
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchDrop();
  }, [id]);

  async function copyContent() {
    if (!drop) return;

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
              <a href="/" style={{ ...styles.button, display: "inline-block", maxWidth: "200px", marginTop: "20px" }}>
                Go to DropNexa
              </a>
            </div>
          ) : drop ? (
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
