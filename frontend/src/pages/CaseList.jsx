import { useState } from "react";
import { Link } from "react-router-dom";

import Button from "../components/ui/Button";
import Select from "../components/ui/Select";
import SkeletonCard from "../components/loading/SkeletonCard";

import { useCases } from "../hooks/useCases";
import { ROUTES } from "../constants";

export default function CaseList() {
  const { cases, loading, error, refreshCases } = useCases();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredCases = cases.filter((item) => {
    const query = search.toLowerCase();

    const matchesSearch =
      item.title?.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.case_id?.toLowerCase().includes(query);

    const matchesStatus =
      statusFilter === "all" || item.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalCases = cases.length;
  const openCases = cases.filter((c) => c.status === "Open").length;
  const activeCases = cases.filter((c) => c.status === "Active").length;
  const closedCases = cases.filter((c) => c.status === "Closed").length;

  return (
    <div
      style={{
        color: "var(--text-primary)",
      }}
    >
      <h1>Investigations</h1>

      {/* Statistics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {[
          ["Total Cases", totalCases],
          ["Open", openCases],
          ["Active", activeCases],
          ["Closed", closedCases],
        ].map(([label, value]) => (
          <div
            key={label}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "20px",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                color: "var(--text-secondary)",
              }}
            >
              {label}
            </div>

            <div
              style={{
                fontSize: "32px",
                fontWeight: "700",
                marginTop: "8px",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter + Button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "12px",
          }}
        >
          <input
            type="text"
            placeholder="Search investigations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "320px",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
            }}
          />

          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: "180px" }}
          >
            <option value="all">All Status</option>
            <option value="Open">Open</option>
            <option value="Active">Active</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Closed">Closed</option>
          </Select>
        </div>

        <Link to={ROUTES.NEW_CASE}>
          <Button>+ New Investigation</Button>
        </Link>
      </div>

      {/* Loading */}
      {loading && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {/* Error */}
      {!loading && error && (
        <div
          style={{
            padding: "24px",
            border: "1px solid var(--danger)",
            borderRadius: "12px",
            background: "var(--bg-surface)",
          }}
        >
          <h3>Unable to load investigations.</h3>

          <p>{error.message || "Something went wrong."}</p>

          <Button onClick={refreshCases}>Retry</Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filteredCases.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "48px",
            border: "1px dashed var(--border)",
            borderRadius: "12px",
          }}
        >
          <h3>No investigations found</h3>

          <p
            style={{
              color: "var(--text-secondary)",
            }}
          >
            Create your first investigation to begin.
          </p>

          <Link to={ROUTES.NEW_CASE}>
            <Button>+ Start First Investigation</Button>
          </Link>
        </div>
      )}

      {/* Cases */}
      {!loading &&
        !error &&
        filteredCases.map((item) => (
          <div
            key={item.id}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "20px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "8px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  color: "var(--text-primary)",
                }}
              >
                {item.title}
              </h2>

              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  background: "var(--bg-muted)",
                  padding: "4px 8px",
                  borderRadius: "6px",
                }}
              >
                {item.case_id}
              </span>
            </div>

            <p
              style={{
                color: "var(--text-secondary)",
              }}
            >
              {item.description || "No description"}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "10px",
                marginTop: "16px",
              }}
            >
              <div>
                <strong>Status:</strong> {item.status}
              </div>

              <div>
                <strong>Priority:</strong> {item.priority}
              </div>

              <div>
                <strong>Evidence:</strong> {item.evidence_count}
              </div>

              <div>
                <strong>Witnesses:</strong> {item.witness_count}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
