
"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/components/AuthProvider";

type Tool = "file" | "text" | "link" | "inbox";

const toolNames: Record<Tool, string> = {
  file: "FileDrop",
  text: "TextDrop",
  link: "LinkDrop",
  inbox: "Drop Inbox",
};

export default function Home() {
  const { user, loading, error } = useAuth();

  const [activeTool, setActiveTool] = useState<Tool>("file");
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState("");
  const [linkContent, setLinkContent] = useState("");
  const [expiry, setExpiry] = useState("24 hours");
  const [customExpiry, setCustomExpiry] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [limitEnabled, setLimitEnabled] = useState(false);
  const [downloadLimit, setDownloadLimit] = useState("5");
  const [oneTime, setOneTime] = useState(false);
  const [encryption, setEncryption] = useState(false);
  const [createdLink, setCreatedLink] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inboxName, setInboxName] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);

  const selectTool = (tool: Tool) => {
    setActiveTool(tool);
    setCreatedLink("");
    setShowQr(false);
    setNotice("");
  };

  const createDrop = async () => {
    if (loading || !user) {
      setNotice("Your guest session is not ready. Please wait.");
      return;
    }

    if (creating) return;

    if (activeTool === "file" && !file) {
      setNotice("Choose a file before continuing.");
      return;
    }

    if (activeTool === "text" && !textContent.trim()) {
      setNotice("Enter some text before continuing.");
      return;
    }

    if (activeTool === "link" && !linkContent.trim()) {
      setNotice("Enter a link before continuing.");
      return;
    }

    if (activeTool === "link") {
      try {
        const parsedUrl = new URL(linkContent.trim());

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          setNotice("Please enter a valid HTTP or HTTPS link.");
          return;
        }
      } catch {
        setNotice("Please enter a valid link.");
        return;
      }
    }

    if (passwordEnabled && password.length < 6) {
      setNotice("Your password must contain at least 6 characters.");
      return;
    }

    if (limitEnabled) {
      const limit = Number(downloadLimit);

      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
        setNotice("Download limit must be between 1 and 1000.");
        return;
      }
    }

    if (activeTool === "inbox" && !inboxName.trim()) {
      setNotice("Give your inbox a name first.");
      return;
    }

    if (expiry === "Custom") {
      if (!customExpiry || new Date(customExpiry).getTime() <= Date.now()) {
        setNotice("Choose a future expiry date and time.");
        return;
      }
    }

    setCreating(true);
    setNotice("");
    setCreatedLink("");
    setShowQr(false);

    try {
      // Real backend integration for TextDrop and LinkDrop.
      if (activeTool === "text" || activeTool === "link") {
        const token = await user.getIdToken();

        const response = await fetch("/api/drops", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: activeTool,
            content:
              activeTool === "text"
                ? textContent.trim()
                : linkContent.trim(),
            expiry,
            ...(expiry === "Custom" ? { customExpiry } : {}),
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success || !data.drop?.shareUrl) {
          throw new Error(data.message || "Unable to create your drop.");
        }

        setCreatedLink(data.drop.shareUrl);
        setNotice(
          `${toolNames[activeTool]} saved successfully in Firestore. Public sharing will be enabled after the retrieval endpoint is built.`
        );

        return;
      }

      // FileDrop and Drop Inbox are still frontend previews.
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const url = `${window.location.origin}/d/${id}`;

      setCreatedLink(url);
      setNotice(
        activeTool === "file"
          ? "FileDrop preview created. Real file uploads are coming with Cloudflare R2."
          : "Inbox preview created. Real inbox functionality is not connected yet."
      );
    } catch (err) {
      console.error("Create drop error:", err);

      setNotice(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    if (!createdLink) return;

    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice("Clipboard access failed. Select and copy the link manually.");
    }
  };

  const toolItems: {
    id: Tool;
    icon: string;
    label: string;
    description: string;
  }[] = [
    {
      id: "file",
      icon: "↥",
      label: "FileDrop",
      description: "Send files",
    },
    {
      id: "text",
      icon: "T",
      label: "TextDrop",
      description: "Share text",
    },
    {
      id: "link",
      icon: "↗",
      label: "LinkDrop",
      description: "Collect links",
    },
    {
      id: "inbox",
      icon: "↓",
      label: "Drop Inbox",
      description: "Receive files",
    },
  ];

  return (
    <main className="dashboard">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-icon">D</span>
          <span>
            dropnexa<span className="orange">.</span>
          </span>
        </a>

        <div className="side-label">WORKSPACE</div>

        <button
          className="side-link active"
          onClick={() => selectTool("file")}
        >
          <span className="side-icon">▦</span>
          Dashboard
        </button>

        <div className="side-label tools-label">TOOLS</div>

        <div className="side-tools">
          {toolItems.map((tool) => (
            <button
              key={tool.id}
              onClick={() => selectTool(tool.id)}
              className={`side-link ${
                activeTool === tool.id ? "selected" : ""
              }`}
            >
              <span className="side-icon">{tool.icon}</span>
              <span className="side-tool-text">
                <strong>{tool.label}</strong>
                <small>{tool.description}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-top">
              <span>YOUR PLAN</span>
              <span className="plan-dot" />
            </div>
            <strong>Free workspace</strong>
            <p>Share without an account.</p>
            <div className="plan-line">
              <span />
            </div>
            <small>Guest mode enabled</small>
          </div>

          <div className="sidebar-footer">
            <span className="avatar">
              {loading ? "..." : user?.isAnonymous ? "G" : "U"}
            </span>
            <div>
              <strong>
                {loading
                  ? "Connecting..."
                  : user?.isAnonymous
                    ? "Guest user"
                    : user
                      ? "Account user"
                      : "Offline"}
              </strong>
              <small>
                {loading
                  ? "Starting session"
                  : user
                    ? `ID: ${user.uid.slice(0, 8)}...`
                    : error || "Authentication unavailable"}
              </small>
            </div>
            <span className="more-icon">···</span>
          </div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>{toolNames[activeTool]}</strong>
          </div>

          <div className="topbar-right">
            <span className="secure-status">
              <span /> Private workspace
            </span>
            <button className="account-button">
              {user?.isAnonymous ? "G" : "U"}
            </button>
          </div>
        </header>

        <div className="workspace">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="live-dot" />
                YOUR SHARING WORKSPACE
              </div>
              <h1>
                Make a <span>drop.</span>
              </h1>
              <p className="welcome-subtitle">
                Send something, receive something, or share an idea.
              </p>
            </div>

            <div className="date-note">
              <span className="date-symbol">✳</span>
              <div>
                <strong>Temporary by design.</strong>
                <small>Your sharing, your rules.</small>
              </div>
            </div>
          </div>

          <div className="tool-switcher">
            {toolItems.map((tool) => (
              <button
                key={tool.id}
                className={`tool-tab ${
                  activeTool === tool.id ? "active-tab" : ""
                }`}
                onClick={() => selectTool(tool.id)}
              >
                <span className="tab-icon">{tool.icon}</span>
                <span>{tool.label}</span>
                {activeTool === tool.id && (
                  <span className="tab-indicator" />
                )}
              </button>
            ))}
          </div>

          <div className="content-grid">
            <section className="creation-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-kicker">CREATE SOMETHING NEW</div>
                  <h2>{toolNames[activeTool]}</h2>
                </div>
                <span className="step-indicator">01 / CREATE</span>
              </div>

              {activeTool === "file" && (
                <div className="upload-zone">
                  <input
                    id="file-upload"
                    type="file"
                    onChange={(event) =>
                      setFile(event.target.files?.[0] || null)
                    }
                    hidden
                  />
                  <label htmlFor="file-upload" className="upload-content">
                    <span className="upload-symbol">↥</span>
                    <strong>
                      {file ? file.name : "Drop your files here"}
                    </strong>
                    <span>
                      {file
                        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                        : "or click to browse your device"}
                    </span>
                    <span className="browse-button">
                      {file ? "Choose another file" : "Browse files"}
                    </span>
                  </label>
                  <div className="upload-footnote">
                    <span>◈</span> File size limits will depend on your plan.
                  </div>
                </div>
              )}

              {activeTool === "text" && (
                <div className="input-workspace">
                  <label htmlFor="text-content">YOUR MESSAGE</label>
                  <textarea
                    id="text-content"
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Write something worth sharing..."
                  />
                  <div className="field-hint">
                    Plain text, notes, code snippets and more.
                  </div>
                </div>
              )}

              {activeTool === "link" && (
                <div className="input-workspace">
                  <label htmlFor="link-content">LINK TO SHARE</label>
                  <input
                    id="link-content"
                    value={linkContent}
                    onChange={(e) => setLinkContent(e.target.value)}
                    placeholder="https://example.com"
                  />
                  <div className="field-hint">
                    Link collections and multiple URLs can be added in a
                    future update.
                  </div>
                </div>
              )}

              {activeTool === "inbox" && (
                <div className="input-workspace inbox-workspace">
                  <div className="inbox-illustration">↓</div>
                  <label htmlFor="inbox-name">INBOX NAME</label>
                  <input
                    id="inbox-name"
                    value={inboxName}
                    onChange={(e) => setInboxName(e.target.value)}
                    placeholder="e.g. Project submissions"
                  />
                  <div className="field-hint">
                    Create a request link so others can send files to you.
                  </div>
                </div>
              )}

              <div className="settings-area">
                <div className="settings-title">
                  <span>DROP SETTINGS</span>
                  <span>OPTIONAL CONTROLS</span>
                </div>

                <div className="settings-grid">
                  <div className="setting-field">
                    <label htmlFor="expiry">EXPIRY TIME</label>
                    <select
                      id="expiry"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                    >
                      <option>1 hour</option>
                      <option>2 hours</option>
                      <option>6 hours</option>
                      <option>24 hours</option>
                      <option>7 days</option>
                      <option>30 days</option>
                      <option>Custom</option>
                    </select>
                  </div>

                  {expiry === "Custom" && (
                    <div className="setting-field">
                      <label htmlFor="custom-expiry">CUSTOM DATE</label>
                      <input
                        id="custom-expiry"
                        type="datetime-local"
                        value={customExpiry}
                        onChange={(e) => setCustomExpiry(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="setting-field">
                    <label>DOWNLOAD LIMIT</label>
                    <div className="setting-inline">
                      <button
                        className={`toggle ${limitEnabled ? "on" : ""}`}
                        onClick={() => setLimitEnabled(!limitEnabled)}
                        aria-label="Toggle download limit"
                        aria-pressed={limitEnabled}
                      >
                        <span />
                      </button>
                      {limitEnabled ? (
                        <input
                          className="small-number"
                          type="number"
                          min="1"
                          max="1000"
                          value={downloadLimit}
                          onChange={(e) => setDownloadLimit(e.target.value)}
                        />
                      ) : (
                        <span className="setting-muted">Unlimited</span>
                      )}
                    </div>
                  </div>

                  <div className="setting-field">
                    <label>PASSWORD PROTECTION</label>
                    <div className="setting-inline">
                      <button
                        className={`toggle ${passwordEnabled ? "on" : ""}`}
                        onClick={() =>
                          setPasswordEnabled(!passwordEnabled)
                        }
                        aria-label="Toggle password protection"
                        aria-pressed={passwordEnabled}
                      >
                        <span />
                      </button>
                      <span className="setting-muted">
                        {passwordEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>

                  <div className="setting-field">
                    <label>ONE-TIME ACCESS</label>
                    <div className="setting-inline">
                      <button
                        className={`toggle ${oneTime ? "on" : ""}`}
                        onClick={() => {
                          setOneTime(!oneTime);
                          if (!oneTime) {
                            setLimitEnabled(true);
                            setDownloadLimit("1");
                          }
                        }}
                        aria-label="Toggle one-time access"
                        aria-pressed={oneTime}
                      >
                        <span />
                      </button>
                      <span className="setting-muted">
                        {oneTime ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>

                  <div className="setting-field">
                    <label>END-TO-END ENCRYPTION</label>
                    <div className="setting-inline">
                      <button
                        className={`toggle ${encryption ? "on" : ""}`}
                        onClick={() => setEncryption(!encryption)}
                        aria-label="Toggle encryption"
                        aria-pressed={encryption}
                      >
                        <span />
                      </button>
                      <span className="setting-muted">
                        {encryption ? "Selected" : "Optional"}
                      </span>
                    </div>
                  </div>
                </div>

                {passwordEnabled && (
                  <div className="password-field">
                    <label htmlFor="drop-password">DROP PASSWORD</label>
                    <input
                      id="drop-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </div>
                )}
              </div>

              <div className="create-row">
                <div className="privacy-note">
                  <span>◈</span> Your settings stay attached to this drop.
                </div>
                <button
                  className="create-button"
                  onClick={createDrop}
                  disabled={loading || !user || creating}
                >
                  {creating
                    ? "Creating..."
                    : activeTool === "inbox"
                      ? "Create inbox"
                      : "Create drop"}{" "}
                  <span>↗</span>
                </button>
              </div>

              {notice && (
                <div className="notice" role="status">
                  {notice}
                </div>
              )}

              {createdLink && (
                <div className="result-panel">
                  <div className="result-heading">
                    <span className="result-check">✓</span>
                    <div>
                      <strong>
                        {activeTool === "text" || activeTool === "link"
                          ? "Drop saved successfully"
                          : "Preview link generated"}
                      </strong>
                      <small>
                        {activeTool === "text" || activeTool === "link"
                          ? "Stored in Firebase Firestore"
                          : "Frontend demonstration only"}
                      </small>
                    </div>
                  </div>
                  <div className="result-link">
                    <span>{createdLink}</span>
                    <button onClick={copyLink}>
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                    <button
                      onClick={() => setShowQr(!showQr)}
                      aria-label="Show QR code"
                    >
                      QR
                    </button>
                  </div>
                  {showQr && (
                    <div className="qr-preview">
                      <QRCodeSVG value={createdLink} size={128} />
                      <span>QR code</span>
                    </div>
                  )}
                </div>
              )}
            </section>

            <aside className="right-panel">
              <div className="right-card">
                <div className="right-card-heading">
                  <span>YOUR DROP AT A GLANCE</span>
                  <span className="live-dot" />
                </div>

                <div className="summary-item">
                  <span className="summary-icon">◷</span>
                  <div>
                    <strong>Automatic expiry</strong>
                    <small>{expiry}</small>
                  </div>
                </div>

                <div className="summary-item">
                  <span className="summary-icon">⌑</span>
                  <div>
                    <strong>Access protection</strong>
                    <small>
                      {passwordEnabled ? "Password enabled" : "Open link"}
                    </small>
                  </div>
                </div>

                <div className="summary-item">
                  <span className="summary-icon">⇩</span>
                  <div>
                    <strong>Download access</strong>
                    <small>
                      {oneTime
                        ? "One-time access"
                        : limitEnabled
                          ? `${downloadLimit} downloads`
                          : "Unlimited"}
                    </small>
                  </div>
                </div>

                <div className="summary-item">
                  <span className="summary-icon">◇</span>
                  <div>
                    <strong>Encryption</strong>
                    <small>
                      {encryption ? "Selected" : "Not selected"}
                    </small>
                  </div>
                </div>

                <div className="summary-divider" />

                <div className="privacy-banner">
                  <span>◈</span>
                  <div>
                    <strong>Privacy comes first.</strong>
                    <p>
                      Your drops are designed to be temporary, with access
                      controls you choose.
                    </p>
                  </div>
                </div>
              </div>

              <div className="quick-card">
                <div className="quick-card-title">
                  <span>QUICK GUIDE</span>
                  <span>↗</span>
                </div>
                <strong>Share in three steps.</strong>
                <p>Choose a tool, set your rules, then share your link.</p>
                <div className="quick-steps">
                  <span>01 Choose</span>
                  <span>02 Configure</span>
                  <span>03 Share</span>
                </div>
              </div>

              <div className="right-footer">
                <span>BUILT FOR SIMPLE SHARING.</span>
                <span>DN / 001</span>
              </div>
            </aside>
          </div>
        </div>

        <footer className="bottom-bar">
          <span>
            <span className="live-dot" /> ALL SYSTEMS READY
          </span>
          <span>DROPNEXA © 2026</span>
          <span>SHARE FREELY. EXPIRE GRACEFULLY.</span>
        </footer>
      </section>
    </main>
  );
}
