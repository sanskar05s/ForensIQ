import { User, Bot } from "lucide-react";

const mono = { fontFamily: "'JetBrains Mono', monospace" };

function formatContent(text) {
  if (!text) return text;
  const parts = [];
  const lines = text.split("\n");
  const sectionLabels = ["Analysis:", "Evidence referenced:", "Suggested actions:"];

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const isSection = sectionLabels.some((l) => trimmed.startsWith(l));

    if (isSection) {
      const colonIdx = trimmed.indexOf(":");
      const label = trimmed.slice(0, colonIdx + 1);
      const rest = trimmed.slice(colonIdx + 1);
      parts.push(
        <div key={i} style={{ marginTop: i > 0 ? "10px" : "0" }}>
          <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "13px" }}>
            {label}
          </span>
          {rest && <span>{rest}</span>}
        </div>
      );
    } else {
      // Handle **bold**
      const boldParts = trimmed.split(/(\*\*.*?\*\*)/g);
      parts.push(
        <div key={i} style={{ marginTop: i > 0 && trimmed ? "4px" : "0" }}>
          {boldParts.map((part, j) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={j}>{part.slice(2, -2)}</strong>;
            }
            return <span key={j}>{part}</span>;
          })}
        </div>
      );
    }
  });

  return parts;
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AssistantMessage({ role, content, timestamp }) {
  const isUser = role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "12px",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          display: "flex",
          flexDirection: isUser ? "row-reverse" : "row",
          gap: "8px",
          alignItems: "flex-start",
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: isUser ? "var(--accent)" : "var(--bg-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {isUser ? (
            <User size={14} color="#fff" />
          ) : (
            <Bot size={14} color="var(--accent)" />
          )}
        </div>

        {/* Bubble */}
        <div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "12px",
              background: isUser ? "rgba(59,130,246,0.15)" : "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontSize: "13px",
              lineHeight: "1.6",
              borderTopRightRadius: isUser ? "4px" : "12px",
              borderTopLeftRadius: isUser ? "12px" : "4px",
            }}
          >
            {isUser ? content : formatContent(content)}
          </div>
          {timestamp && (
            <div
              style={{
                ...mono,
                fontSize: "10px",
                color: "var(--text-muted)",
                marginTop: "4px",
                textAlign: isUser ? "right" : "left",
              }}
            >
              {timeAgo(timestamp)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
