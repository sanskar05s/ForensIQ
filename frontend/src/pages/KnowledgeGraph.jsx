import { useState, useEffect, useRef } from "react";
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

  /* Fetch statements once for NodeDetailPanel */
  useEffect(() => {
    apiClient(`/witness/cases/${caseId}/statements`)
      .then((res) => setCachedStatements(res.statements || []))
      .catch(() => {});
  }, [caseId]);

  /* Fetch graph data */
  useEffect(() => {
    fetchGraph();
  }, [caseId]);

  async function fetchGraph() {
    setLoading(true);
    try {
      const res = await apiClient(`/graph/cases/${caseId}`);
      setGraphData(res);
    } catch {
      setGraphData(null);
    } finally {
      setLoading(false);
    }
  }

  /* Initialize Cytoscape when graph data changes */
  useEffect(() => {
    if (!graphData || !graphRef.current) return;

    const nodes = graphData.nodes || [];
    const edges = graphData.edges || [];

    if (nodes.length === 0) return;

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const coloredNodes = nodes.map((n) => ({
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
          },
        })),
        ...edges.map((e) => ({
          data: {
            id: `${e.source}__${e.target}`,
            source: e.source,
            target: e.target,
            relation: e.relation,
            weight: e.weight,
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
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 1, 5, 1, 4)",
            "line-color": "#1E2D45",
            "target-arrow-color": "#1E2D45",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(relation)",
            "font-size": "8px",
            color: "#4A5C75",
          },
        },
      ],
      layout: {
        name: "cose-bilkent",
        animate: nodes.length <= 100,
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
  }, [graphData]);

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
      fetchGraph();
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
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
