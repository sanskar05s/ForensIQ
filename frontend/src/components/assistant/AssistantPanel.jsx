import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Sparkles } from "lucide-react";
import AssistantMessage from "./AssistantMessage";
import Spinner from "../loading/Spinner";
import { apiClient } from "../../api/client";

const mono = { fontFamily: "'JetBrains Mono', monospace" };

const SUGGESTED = [
  "Give me an overview of this case.",
  "What are the main contradictions so far?",
  "What evidence is missing from this investigation?",
  "What should I investigate next?",
];

export default function AssistantPanel({ caseId, isOpen, onClose, updateText, onDismissUpdate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Load history on open
  useEffect(() => {
    if (!isOpen || !caseId || historyLoaded) return;
    apiClient(`/assistant/cases/${caseId}/history`)
      .then((res) => {
        const hist = (res.history || []).flatMap((h) => [
          { role: "user", content: h.query, timestamp: h.created_at },
          { role: "assistant", content: h.response, timestamp: h.created_at },
        ]);
        setMessages(hist);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [isOpen, caseId, historyLoaded]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  async function handleSend(text) {
    const query = (text || input).trim();
    if (!query || sending) return;

    const userMsg = { role: "user", content: query, timestamp: new Date().toISOString() };
    const thinkingMsg = { role: "assistant", content: "thinking", timestamp: null };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await apiClient(`/assistant/cases/${caseId}/query`, {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: res.response,
          timestamp: new Date().toISOString(),
        };
        return updated;
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, I couldn't process that request. Please try again.",
          timestamp: new Date().toISOString(),
        };
        return updated;
      });
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Backdrop + Panel
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 998,
            background: "rgba(0,0,0,0.3)",
          }}
        />
      )}

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: "64px",
          right: 0,
          width: "380px",
          height: "calc(100vh - 64px)",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          zIndex: 999,
          display: "flex",
          flexDirection: "column",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 250ms ease-out",
          boxShadow: isOpen ? "var(--shadow-md)" : "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: "16px" }}>
              ForensIQ AI
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
              Answers are based on your case data only.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Update notification */}
        {updateText && (
          <div
            style={{
              margin: "12px 16px 0",
              padding: "10px 12px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(202,138,4,0.12)",
              border: "1px solid var(--warning)",
              fontSize: "12px",
              color: "var(--text-primary)",
              display: "flex",
              gap: "8px",
              alignItems: "flex-start",
            }}
          >
            <Sparkles size={14} color="var(--warning)" style={{ flexShrink: 0, marginTop: "2px" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: "4px", color: "var(--warning)" }}>
                Investigation Update
              </div>
              {updateText}
            </div>
            <button
              onClick={onDismissUpdate}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0" }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Conversation area */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
          }}
        >
          {messages.length === 0 && !sending ? (
            <div style={{ textAlign: "center", marginTop: "40px" }}>
              <MessageSquare size={36} color="var(--text-muted)" style={{ marginBottom: "12px", opacity: 0.5 }} />
              <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                Ask anything about this case
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {SUGGESTED.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    style={{
                      background: "var(--bg-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                      padding: "10px 14px",
                      fontSize: "12px",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "var(--transition)",
                    }}
                    onMouseEnter={(e) => (e.target.style.borderColor = "var(--accent)")}
                    onMouseLeave={(e) => (e.target.style.borderColor = "var(--border)")}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) =>
              msg.content === "thinking" ? (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px", padding: "10px 14px", background: "var(--bg-elevated)", borderRadius: "12px", maxWidth: "85%", fontSize: "13px", color: "var(--text-muted)" }}>
                  <Spinner size={14} /> Thinking...
                </div>
              ) : (
                <AssistantMessage key={i} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
              )
            )
          )}
        </div>

        {/* Input area */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "8px",
            alignItems: "flex-end",
            flexShrink: 0,
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about this case..."
            disabled={sending}
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              background: "var(--bg-muted)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
              fontSize: "13px",
              color: "var(--text-primary)",
              outline: "none",
              fontFamily: "inherit",
              maxHeight: "80px",
            }}
            onFocus={(e) => { e.target.rows = 4; }}
            onBlur={(e) => { if (!e.target.value) e.target.rows = 2; }}
          />
          <button
            onClick={() => handleSend()}
            disabled={sending || !input.trim()}
            style={{
              background: input.trim() ? "var(--accent)" : "var(--bg-muted)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
              cursor: input.trim() ? "pointer" : "default",
              color: input.trim() ? "#fff" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
