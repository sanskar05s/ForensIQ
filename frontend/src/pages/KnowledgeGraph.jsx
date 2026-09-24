import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Share2 } from "lucide-react";
import cytoscape from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";

import AppShell from "../components/layout/AppShell";
import Spinner from "../components/loading/Spinner";
import NodeDetailPanel from "../components/graph/NodeDetailPanel";
import { apiClient } from "../api/client";
import { NODE_COLORS } from "../constants";

cytoscape.use(coseBilkent);

const monoStyle = { fontFamily: "'JetBrains Mono', monospace" };

const SEMANTIC_RELATIONS = new Set([
  "HIT", "SAW", "OBSERVED", "FOLLOWED", "FLED_TO", "ENTERED", "EXITED",
  "LOCATED_AT", "WAITED_AT", "USED_VEHICLE", "RODE", "DROVE", "PUSHED",
  "GRABBED", "CARRIED", "APPROACHED", "FLED_VIA", "CALLED", "REPORTED_TO",
]);

export default function KnowledgeGraph() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const graphRef = useRef(null);
  const cyRef = useRef(null);

  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [cachedStatements, setCachedStatements] = useState([]);
  const [visibleRelations, setVisibleRelations] = useState({
    semantic: true,
    witness: false,
    cooccur: false,
  });
  const [minMentions, setMinMentions] = useState(2);

  /* Fetch statements once for NodeDetailPanel */
  useEffect(() => {
    apiClient(`/witness/cases/${caseId}/statements`)
      .then((res) => setCachedStatements(res.statements || []))
      .catch(() => {});
  }, [caseId]);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient(`/graph/cases/${caseId}`);
      setGraphData(res);
    } catch {
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  /* Fetch graph data */
  useEffect(() => {
    let active = true;
    apiClient(`/graph/cases/${caseId}`)
      .then((res) => {
        if (active) setGraphData(res);
      })
      .catch(() => {
        if (active) setGraphData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId]);

  /* Initialize Cytoscape when graph data or filter options change */
  useEffect(() => {
    if (!graphData || !graphRef.current) return;

    const nodes = graphData.nodes || [];
    const edges = graphData.edges || [];

    // Filter nodes by mention count and witness visibility
    const filteredNodes = nodes.filter((n) => {
      if (n.type === "WITNESS") {
        return visibleRelations.witness;
      }
      return (n.mention_count ?? 0) >= minMentions;
    });

    const validNodeIds = new Set(filteredNodes.map((n) => n.id));

    // Filter edges by relationship type and ensure endpoints exist in filteredNodes
    const visibleEdges = edges.filter((e) => {
      if (!validNodeIds.has(e.source) || !validNodeIds.has(e.target)) {
        return false;
      }
      if (SEMANTIC_RELATIONS.has(e.relation)) return visibleRelations.semantic;
      if (e.relation === "WITNESS_REPORTED") return visibleRelations.witness;
      return visibleRelations.cooccur;
    });

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    if (filteredNodes.length === 0) return;

    const coloredNodes = filteredNodes.map((n) => ({
      ...n,
      color: NODE_COLORS[n.type] || "#7B8FAE",
    }));

    const cy = cytoscape({
      container: graphRef.current,
      elements: [
        ...coloredNodes.map((n) => ({
          data: {
            id: n.id,
            label: n.label,
            type: n.type,
            mentionCount: n.mention_count,
            centrality: n.centrality_score,
            communityId: n.community_id,
            degree: n.degree,
            color: n.color,
            statementIds: n.statement_ids || [],
          },
        })),
        ...visibleEdges.map((e) => ({
          data: {
            id: `${e.source}__${e.target}__${e.relation}`,
            source: e.source,
            target: e.target,
            relation: e.relation,
            weight: e.weight,
            confidence: e.confidence,
            source_statement_id: e.source_statement_id,
            source_witness: e.source_witness,
            evidence_text: e.evidence_text,
          },
        })),
      ],
      style: [
        {
          selector: "node",
          style: {
            width: "mapData(centrality, 0, 1, 20, 60)",
            height: "mapData(centrality, 0, 1, 20, 60)",
            "background-color": "data(color)",
            label: "data(label)",
            "font-family": "JetBrains Mono",
            "font-size": "10px",
            color: "#E8EDF7",
            "text-wrap": "wrap",
            "text-max-width": "80px",
            "text-valign": "center",
            "text-halign": "center",
            "border-width": 1,
            "border-color": "#1E2D45",
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 3,
            "border-color": "#3B82F6",
          },
        },
        // All edges: no label by default, thin line
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 1, 5, 1, 3)",
            "line-color": "#1E2D45",
            "target-arrow-shape": "none",
            "curve-style": "bezier",
            label: "",
          },
        },
        // Semantic edges only: show label + distinct color + arrow
        {
          selector:
            'edge[relation != "co-mentioned"][relation != "co-detected"][relation != "WITNESS_REPORTED"][relation != "temporal-context"]',
          style: {
            "line-color": "#7C3AED",
            "target-arrow-color": "#7C3AED",
            "target-arrow-shape": "triangle",
            label: "data(relation)",
            "font-size": "9px",
            color: "#7C3AED",
            "text-rotation": "autorotate",
            "text-background-color": "#1e293b",
            "text-background-opacity": 0.8,
            "text-background-padding": "2px",
            width: 2,
          },
        },
        // WITNESS_REPORTED: subtle blue, no label
        {
          selector: 'edge[relation = "WITNESS_REPORTED"]',
          style: {
            "line-color": "#1D4ED8",
            "line-style": "dashed",
            width: 1,
            opacity: 0.4,
          },
        },
        // co-mentioned / co-detected: very subtle, no label
        {
          selector:
            'edge[relation = "co-mentioned"], edge[relation = "co-detected"]',
          style: {
            "line-color": "#1E2D45",
            width: 1,
            opacity: 0.25,
          },
        },
      ],
      layout: {
        name: "cose-bilkent",
        animate: filteredNodes.length <= 100,
        animationDuration: 500,
        nodeRepulsion: 8000,
        idealEdgeLength: 100,
        fit: true,
        padding: 40,
      },
    });

    cyRef.current = cy;

    /* Node click handler — toggle */
    cy.on("tap", "node", (evt) => {
      const nodeData = evt.target.data();
      setSelectedNode((prev) =>
        prev && prev.id === nodeData.id ? null : nodeData
      );
    });

    /* Click background to close panel */
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
      }
    });

    /* Resize handler */
    const handleResize = () => {
      cy.resize();
      cy.fit();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [graphData, visibleRelations, minMentions]);

  async function handleBuild() {
    setRunning(true);
    setRunResult(null);
    setRunError("");
    try {
      const res = await apiClient(`/graph/cases/${caseId}/build`, {
        method: "POST",
      });
      setRunResult(res);
      setTimeout(() => setRunResult(null), 5000);
      setSelectedNode(null);
      await fetchGraph();
    } catch (err) {
      setRunError(err.message || "Failed to build graph.");
    } finally {
      setRunning(false);
    }
  }

  const hasGraph =
    graphData && (graphData.nodes || []).length > 0;

  const sna = graphData?.sna_metrics || {};

  return (
    <AppShell>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Header */}
        <button
          onClick={() => navigate(`/cases/${caseId}`)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "20px",
            fontSize: "14px",
          }}
        >
          <ArrowLeft size={16} />
          Back to Case
        </button>

        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            fontSize: "28px",
            margin: 0,
            marginBottom: "20px",
          }}
        >
          Knowledge Graph
        </h1>

        {/* SNA summary bar */}
        {hasGraph && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "20px",
              padding: "10px 16px",
              background: "var(--bg-muted)",
              borderRadius: "var(--radius-sm)",
              marginBottom: "16px",
              ...monoStyle,
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            <span>
              Entities: <strong>{(graphData.nodes || []).length}</strong>
            </span>
            <span>
              Connections: <strong>{(graphData.edges || []).length}</strong>
            </span>
            <span>
              Communities: <strong>{sna.community_count ?? "—"}</strong>
            </span>
            <span>
              Density: <strong>{sna.density?.toFixed(4) ?? "—"}</strong>
            </span>
          </div>
        )}

        {/* Action row */}
        <div style={{ marginBottom: "16px" }}>
          <button
            onClick={handleBuild}
            disabled={running}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: running ? "not-allowed" : "pointer",
              opacity: running ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {running && <Spinner size={14} />}
            {running ? "Building graph..." : "Rebuild Graph"}
          </button>

          {runResult && (
            <p
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "var(--success)",
              }}
            >
              Graph built: {runResult.node_count} nodes, {runResult.edge_count}{" "}
              edges, {runResult.community_count} communities.
            </p>
          )}
          {runError && (
            <p
              style={{
                marginTop: "12px",
                fontSize: "13px",
                color: "var(--danger)",
              }}
            >
              {runError}
            </p>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div
            style={{
              height: "600px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <Spinner />
          </div>
        )}

        {/* Empty state */}
        {!loading && !hasGraph && (
          <div
            style={{
              height: "600px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              color: "var(--text-muted)",
            }}
          >
            <Share2 size={64} style={{ marginBottom: "16px", opacity: 0.5 }} />
            <p style={{ fontSize: "16px", marginBottom: "6px" }}>
              Knowledge graph not yet built.
            </p>
            <p style={{ fontSize: "13px", marginBottom: "20px" }}>
              Add witness statements and click Rebuild Graph.
            </p>
            <button
              onClick={handleBuild}
              disabled={running}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Rebuild Graph
            </button>
          </div>
        )}

        {/* Filters */}
        {!loading && hasGraph && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              flexWrap: "wrap",
            }}
          >
            {[
              { key: "semantic", label: "Semantic", color: "#7C3AED" },
              { key: "witness", label: "Witnesses", color: "#1D4ED8" },
              { key: "cooccur", label: "Co-occurrence", color: "#374151" },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() =>
                  setVisibleRelations((v) => ({ ...v, [key]: !v[key] }))
                }
                style={{
                  padding: "4px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  border: `1px solid ${color}`,
                  background: visibleRelations[key] ? color : "transparent",
                  color: visibleRelations[key] ? "#fff" : color,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}

            <div
              style={{
                display: "flex",
                gap: "6px",
                alignItems: "center",
                marginLeft: "16px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Min mentions:
              </span>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setMinMentions(n)}
                  style={{
                    padding: "2px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    border: "1px solid var(--border)",
                    background:
                      minMentions === n ? "var(--accent)" : "transparent",
                    color: minMentions === n ? "#fff" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  {n}+
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Graph container */}
        {!loading && hasGraph && (
          <div
            style={{
              position: "relative",
              height: "600px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden",
            }}
          >
            <div ref={graphRef} style={{ width: "100%", height: "100%" }} />

            <NodeDetailPanel
              node={selectedNode}
              caseId={caseId}
              onClose={() => setSelectedNode(null)}
              cachedStatements={cachedStatements}
              edges={graphData?.edges || []}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
