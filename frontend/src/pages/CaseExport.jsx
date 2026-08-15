import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../api/client";
import AppShell from "../components/layout/AppShell";
import Spinner from "../components/loading/Spinner";
import { ArrowLeft, FileText, CheckCircle, AlertTriangle } from "lucide-react";

export default function CaseExport() {
  const { caseId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = async () => {
    try {
      const response = await apiClient(`/report/cases/${caseId}`);
      setReport(response.report || null);
    } catch (err) {
      setError(err.message || "Failed to fetch report status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [caseId]);

  useEffect(() => {
    let interval;
    if (report?.status === "generating") {
      interval = setInterval(() => {
        fetchReport();
      }, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [report?.status, caseId]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);
      await apiClient(`/report/cases/${caseId}/generate`, { method: "POST" });
      setReport((prev) => ({
        ...(prev || {}),
        status: "generating",
      }));

      await fetchReport(); // Fetch immediately to update state to 'generating'
    } catch (err) {
      setError(err.message || "Failed to generate report");
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    try {
      const result = await apiClient(`/report/cases/${caseId}/download`);
      if (result.url) {
        window.open(result.url, "_blank");
      }
    } catch (err) {
      setError(err.message || "Failed to download report");
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div
          style={{ display: "flex", justifyContent: "center", padding: "4rem" }}
        >
          <Spinner />
        </div>
      );
    }

    if (!report) {
      return (
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "3rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: "2rem",
            }}
          >
            <FileText
              size={64}
              style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}
            />
            <h2
              style={{
                margin: "0 0 1rem 0",
                color: "var(--text-primary)",
                fontFamily: '"Space Grotesk", sans-serif',
              }}
            >
              No report generated yet.
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                maxWidth: "600px",
                margin: "0 auto",
              }}
            >
              Generate a comprehensive case report containing all investigation
              findings, AI analysis, and blockchain verification.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
              background: "var(--bg-muted)",
              padding: "1.5rem",
              borderRadius: "var(--radius-md)",
            }}
          >
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.5rem",
                color: "var(--text-primary)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <li>Executive Summary (AI-generated)</li>
              <li>Investigation Summary</li>
              <li>Evidence Summary</li>
              <li>Witness Statements Summary</li>
            </ul>
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.5rem",
                color: "var(--text-primary)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <li>Contradiction Summary</li>
              <li>Timeline Summary</li>
              <li>Blockchain Verification</li>
              <li>AI-Generated Next Steps</li>
            </ul>
          </div>

          {error && (
            <div
              style={{
                color: "var(--danger)",
                padding: "1rem",
                background:
                  "color-mix(in srgb, var(--danger) 10%, transparent)",
                border: "1px solid var(--danger)",
                borderRadius: "var(--radius-md)",
                marginBottom: "1.5rem",
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.5rem",
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: generating ? "not-allowed" : "pointer",
                opacity: generating ? 0.7 : 1,
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {generating ? (
                <>
                  <Spinner /> Generating report — this may take up to 40
                  seconds...
                </>
              ) : (
                "Generate Report"
              )}
            </button>
          </div>
        </div>
      );
    }

    if (report.status === "generating") {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "6rem 2rem",
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border)",
          }}
        >
          <Spinner />
          <h3
            style={{
              marginTop: "1.5rem",
              marginBottom: "0.5rem",
              color: "var(--text-primary)",
              fontFamily: '"Space Grotesk", sans-serif',
            }}
          >
            Generating report...
          </h3>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            Analysing evidence, building sections, creating PDF
          </p>
        </div>
      );
    }

    if (report.status === "ready") {
      const { sections } = report;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          <div
            style={{
              background: "var(--bg-surface)",
              padding: "2.5rem",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "2rem",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background:
                      "color-mix(in srgb, var(--success) 15%, transparent)",
                    color: "var(--success)",
                    padding: "0.5rem 1rem",
                    borderRadius: "9999px",
                    fontWeight: 600,
                    marginBottom: "1rem",
                    fontSize: "14px",
                  }}
                >
                  <CheckCircle size={18} />
                  Report Ready
                </div>
                <p
                  style={{
                    margin: 0,
                    color: "var(--text-muted)",
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: "13px",
                  }}
                >
                  Generated at: {new Date(report.generated_at).toLocaleString()}
                </p>
              </div>
              <div style={{ display: "flex", gap: "1rem" }}>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  style={{
                    padding: "0.75rem 1.5rem",
                    background: "transparent",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    cursor: generating ? "not-allowed" : "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  Regenerate Report
                </button>
                <button
                  onClick={handleDownload}
                  style={{
                    padding: "0.75rem 1.5rem",
                    background: "var(--accent)",
                    color: "white",
                    border: "none",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  Download PDF
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "1rem",
                marginBottom: "2.5rem",
              }}
            >
              {[
                { label: "Evidence", count: sections?.evidence_count || 0 },
                { label: "Witnesses", count: sections?.witness_count || 0 },
                {
                  label: "Contradictions",
                  count: sections?.contradiction_count || 0,
                },
                {
                  label: "Blockchain Verified",
                  count: sections?.blockchain_verified_count || 0,
                },
              ].map((stat, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--bg-muted)",
                    padding: "1.5rem",
                    borderRadius: "var(--radius-md)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "2.5rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      marginBottom: "0.5rem",
                      fontFamily: '"Space Grotesk", sans-serif',
                    }}
                  >
                    {stat.count}
                  </div>
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      fontWeight: 600,
                    }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <h3
                style={{
                  margin: "0 0 1rem 0",
                  color: "var(--text-primary)",
                  fontFamily: '"Space Grotesk", sans-serif',
                }}
              >
                Executive Summary Preview
              </h3>
              <p
                style={{
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  background: "var(--bg-muted)",
                  padding: "1.5rem",
                  borderRadius: "var(--radius-md)",
                  margin: 0,
                  fontStyle: "italic",
                  fontSize: "15px",
                }}
              >
                {sections?.executive_summary
                  ? `${sections.executive_summary.substring(0, 300)}...`
                  : "No executive summary available."}
              </p>
            </div>
          </div>
          {error && (
            <div
              style={{
                color: "var(--danger)",
                padding: "1rem",
                background:
                  "color-mix(in srgb, var(--danger) 10%, transparent)",
                border: "1px solid var(--danger)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {error}
            </div>
          )}
        </div>
      );
    }

    if (report.status === "failed") {
      return (
        <div
          style={{
            background: "var(--bg-surface)",
            padding: "3rem",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--danger)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <AlertTriangle
              size={64}
              style={{ color: "var(--danger)", marginBottom: "1.5rem" }}
            />
            <h2
              style={{
                margin: "0 0 1rem 0",
                color: "var(--text-primary)",
                fontFamily: '"Space Grotesk", sans-serif',
              }}
            >
              Report generation failed.
            </h2>

            {report.error_message && (
              <pre
                style={{
                  background: "var(--bg-muted)",
                  padding: "1.5rem",
                  borderRadius: "var(--radius-md)",
                  color: "var(--danger)",
                  width: "100%",
                  maxWidth: "100%",
                  overflowX: "auto",
                  textAlign: "left",
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: "13px",
                  marginBottom: "2rem",
                }}
              >
                {report.error_message}
              </pre>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                padding: "0.75rem 1.5rem",
                background: "var(--accent)",
                color: "white",
                border: "none",
                borderRadius: "var(--radius-md)",
                cursor: generating ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {generating ? "Trying Again..." : "Try Again"}
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <AppShell>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem" }}>
        <header style={{ marginBottom: "2rem" }}>
          <Link
            to={`/cases/${caseId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              color: "var(--text-secondary)",
              textDecoration: "none",
              marginBottom: "1rem",
            }}
          >
            <ArrowLeft size={16} /> Back to Case
          </Link>
          <h1
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              color: "var(--text-primary)",
              margin: "0",
            }}
          >
            Case Report
          </h1>
        </header>

        {renderContent()}
      </div>
    </AppShell>
  );
}
