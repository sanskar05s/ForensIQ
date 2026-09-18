import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import AppShell from '../components/layout/AppShell';
import Spinner from '../components/loading/Spinner';
import SkeletonCard from '../components/loading/SkeletonCard';
import { 
  ArrowLeft, Briefcase, Upload, Cpu, Shield, 
  Users, GitMerge, Clock, Share2, FileText, 
  MessageSquare, Activity 
} from 'lucide-react';

function timeAgo(dateStr) {
  if (!dateStr) return 'Recently';
  const date = new Date(dateStr);
  const time = date.getTime();
  if (isNaN(time)) return 'Recently';

  const diffMs = Date.now() - time;
  if (diffMs < 0) return 'Just now';

  const diffSec = Math.floor(diffMs / 1000);
  const mins = Math.floor(diffSec / 60);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (diffSec < 60) return 'Just now';
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days} days ago`;

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const getEventConfig = (type) => {
  switch (type) {
    case 'case_created': return { icon: Briefcase, color: 'var(--info)' };
    case 'evidence_uploaded': return { icon: Upload, color: 'var(--accent)' };
    case 'evidence_analyzed': return { icon: Cpu, color: 'var(--success)' };
    case 'blockchain_anchored': return { icon: Shield, color: 'var(--success)' };
    case 'witness_analyzed': return { icon: Users, color: 'var(--accent)' };
    case 'contradictions_run': return { icon: GitMerge, color: 'var(--warning)' };
    case 'timeline_regenerated': return { icon: Clock, color: 'var(--info)' };
    case 'graph_regenerated': return { icon: Share2, color: 'var(--info)' };
    case 'report_generated': return { icon: FileText, color: 'var(--success)' };
    case 'assistant_queried': return { icon: MessageSquare, color: 'var(--accent)' };
    default: return { icon: Activity, color: 'var(--text-muted)' };
  }
};

export default function ActivityLog() {
  const { caseId } = useParams();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const response = await apiClient(`/activity/cases/${caseId}`);
        setActivities(response.activities || []);
      } catch (err) {
        setError(err.message || 'Failed to fetch activity');
      } finally {
        setLoading(false);
      }
    };
    fetchActivity();
  }, [caseId]);

  return (
    <AppShell>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <header style={{ marginBottom: '2rem' }}>
          <Link to={`/cases/${caseId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: '1rem' }}>
            <ArrowLeft size={16} /> Back to Case
          </Link>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>Investigation Activity</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Complete history of investigator and system actions</p>
        </header>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : error ? (
          <div style={{ color: 'var(--danger)', padding: '1rem', background: 'var(--bg-surface)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)' }}>
            {error}
          </div>
        ) : activities.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
            <Activity size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>No activity recorded yet.</h3>
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>Events are logged automatically as you work on this case.</p>
          </div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: '1.5rem' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '1.5rem', width: '2px', background: 'var(--border)', transform: 'translateX(-50%)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {activities.map((activity, idx) => {
                const { icon: Icon, color } = getEventConfig(activity.event_type);
                return (
                  <div key={idx} style={{ position: 'relative', display: 'flex', gap: '1.5rem' }}>
                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '3rem', height: '3rem', borderRadius: '50%', background: 'var(--bg-surface)', border: '2px solid var(--border)', flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '2.5rem', height: '2.5rem', borderRadius: '50%', background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
                        <Icon size={18} color={color} />
                      </div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-muted)', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                          {activity.event_type.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {timeAgo(activity.created_at || activity.timestamp)}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {activity.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
