import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Button from "../components/ui/Button";

import ThemeToggle from "../components/ThemeToggle";

import { useAuth } from "../hooks/useAuth";
import { getUserCases } from "../api/cases";

export default function CaseList() {
  const { user } = useAuth();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function loadCases() {
      setLoading(true);

      const { data, error } = await getUserCases(user.id);

      if (error) {
        console.error(error);
      } else {
        setCases(data || []);
      }

      setLoading(false);
    }

    loadCases();
  }, [user]);

  if (loading) {
    return (
      <div
        style={{
          padding: "40px",
          background: "var(--bg)",
          minHeight: "100vh",
          color: "var(--text-primary)",
        }}
      >
        <h1>Investigations</h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Loading investigations...
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "40px",
        background: "var(--bg)",
        minHeight: "100vh",
        color: "var(--text-primary)",
      }}
    >
      <ThemeToggle />
      <h1>Investigations</h1>

      <div style={{ marginBottom: "20px" }}>
        <Link to="/cases/new">
          <Button>+ New Investigation</Button>
        </Link>
      </div>

      <hr
        style={{
          borderColor: "var(--border)",
          marginBottom: "20px",
        }}
      />

      {cases.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>
          No investigations found.
        </p>
      ) : (
        cases.map((item) => (
          <div
            key={item.id}
            style={{
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              padding: "15px",
              marginTop: "15px",
              borderRadius: "8px",
            }}
          >
            <h3>{item.title}</h3>

            <p>{item.description || "No description"}</p>

            <p>
              <strong>Status:</strong> {item.status}
            </p>

            <p>
              <strong>Priority:</strong> {item.priority}
            </p>

            <p>
              <strong>Evidence:</strong> {item.evidence_count}
            </p>

            <p>
              <strong>Witnesses:</strong> {item.witness_count}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
