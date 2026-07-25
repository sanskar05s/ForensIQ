import networkx as nx
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)


def compute_sna_metrics(G: nx.Graph) -> dict:
    """
    Computes SNA metrics: density, degree centrality,
    betweenness centrality, Louvain community detection.
    Returns metrics dict including internal _centrality_scores
    and _community_map for node enrichment.
    """
    if len(G.nodes) == 0:
        return {
            "density": 0,
            "top_central_nodes": [],
            "community_count": 0,
            "avg_degree": 0,
            "_centrality_scores": {},
            "_community_map": {}
        }

    density = round(nx.density(G), 4)
    degree_centrality = nx.degree_centrality(G)

    # Betweenness is expensive — cap at 50 nodes for performance
    if len(G.nodes) <= 50:
        betweenness = nx.betweenness_centrality(G)
    else:
        betweenness = {n: 0.0 for n in G.nodes}
        logger.info("Graph > 50 nodes — skipping betweenness centrality")

    # Combined centrality: average of degree and betweenness
    centrality_scores = {
        n: round((degree_centrality.get(n, 0) + betweenness.get(n, 0)) / 2, 4)
        for n in G.nodes
    }

    top_central = sorted(
        centrality_scores, key=centrality_scores.get, reverse=True
    )[:5]

    # Louvain community detection
    community_count = 0
    community_map = {}
    try:
        import community as community_louvain
        partition = community_louvain.best_partition(G)
        community_map = partition
        community_count = len(set(partition.values()))
        logger.info(f"Louvain detected {community_count} communities")
    except ImportError:
        logger.warning("python-louvain not installed — skipping community detection")
    except ValueError as e:
        # Louvain can raise ValueError on disconnected graphs or graphs with
        # self-loops. Non-fatal — skip community detection gracefully.
        logger.warning(f"Community detection skipped (disconnected graph or self-loop): {e}")
    except Exception as e:
        logger.warning(f"Community detection failed: {e}")

    avg_degree = round(
        sum(dict(G.degree()).values()) / max(len(G.nodes), 1), 2
    )

    return {
        "density": density,
        "top_central_nodes": [str(n) for n in top_central],
        "community_count": community_count,
        "avg_degree": avg_degree,
        "_centrality_scores": centrality_scores,
        "_community_map": community_map,
    }


def enrich_nodes_with_sna(nodes: List[dict], sna_metrics: dict) -> List[dict]:
    """
    Adds centrality_score and community_id to each node dict
    using the internal SNA metric maps.
    Mutates nodes in place and returns the list.
    """
    centrality = sna_metrics.get("_centrality_scores", {})
    communities = sna_metrics.get("_community_map", {})

    for node in nodes:
        node_id = node["id"]
        node["centrality_score"] = centrality.get(node_id, 0.0)
        node["community_id"] = communities.get(node_id, 0)

    return nodes


def get_public_metrics(sna_metrics: dict, node_count: int = 0,
                       edge_count: int = 0) -> dict:
    """
    Returns only the public fields of SNA metrics
    (strips internal _prefixed fields before storing in Supabase).
    Also includes node_count and edge_count for frontend display.
    """
    public = {
        k: v for k, v in sna_metrics.items()
        if not k.startswith("_")
    }
    public["node_count"] = node_count
    public["edge_count"] = edge_count
    return public
