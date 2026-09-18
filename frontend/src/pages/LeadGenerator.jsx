import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Spinner from '../components/loading/Spinner';
import { apiClient } from '../api/client';

export default function LeadGenerator() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ summary: '', leads: [] });
  const [error, setError] = useState(null);

  const generateLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient(`/leads/cases/${caseId}/generate`, { method: 'POST' });
      setData(response || { summary: '', leads: [] });
    } catch (err) {
      console.error('Failed to generate leads:', err);
      setError('Failed to generate investigation leads. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateLeads();
  }, [caseId]);

  const getPriorityColor = (priority) => {
    switch (priority?.toUpperCase()) {
      case 'HIGH': return 'var(--critical)';
      case 'MEDIUM': return 'var(--warning)';
      case 'LOW': return 'var(--info)';
      default: return 'var(--info)';
    }
  };

  return (
    <AppShell>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
        <button 
          onClick={() => navigate(`/cases/${caseId}`)}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            background: 'transparent', 
            border: 'none', 
            color: 'var(--accent)', 
            cursor: 'pointer',
            padding: '0',
            marginBottom: '24px',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          <ArrowLeft size={16} />
          Back to Case
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <h1 style={{ 
              fontFamily: 'Space Grotesk, sans-serif', 
              fontWeight: '700', 
              fontSize: '28px', 
              color: 'var(--text-primary)',
              margin: '0 0 4px 0'
            }}>
              Investigation Leads
            </h1>
            <p style={{ 
              color: 'var(--text-secondary)', 
              fontSize: '14px', 
              margin: '0 0 24px 0'
            }}>
              Evidence gaps identified by AI based on witness accounts
            </p>
          </div>
          
          {!loading && (
            <button 
              onClick={generateLeads}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 16px',
                fontSize: '13px',
                color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} />
              Refresh Analysis
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: '16px' }}>
            <Spinner />
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              Analyzing witness accounts for evidence gaps...
            </div>
          </div>
        ) : error ? (
          <div style={{ 
            padding: '16px', 
            background: 'var(--bg-elevated)', 
            border: '1px solid var(--critical)', 
            borderRadius: 'var(--radius-md)',
            color: 'var(--critical)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            {error}
          </div>
        ) : (
          <>
            {data.summary && (
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: '24px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start'
              }}>
                <AlertCircle size={16} style={{ color: 'var(--accent)', marginTop: '2px', flexShrink: 0 }} />
                <div style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.5' }}>
                  {data.summary}
                </div>
              </div>
            )}

            {(!data.leads || data.leads.length === 0) ? (
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                textAlign: 'center'
              }}>
                <CheckCircle size={32} style={{ color: 'var(--success)' }} />
                <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                  No investigation gaps detected. All witness-mentioned evidence appears to be collected.
                </div>
              </div>
            ) : (
              <div>
                {data.leads.map((lead, index) => (
                  <div key={index} style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '20px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ 
                        fontSize: '15px', 
                        color: 'var(--text-primary)', 
                        fontFamily: 'Space Grotesk, sans-serif', 
                        fontWeight: '600'
                      }}>
                        {lead.gap || lead.gap_description}
                      </div>
                      <div style={{
                        background: getPriorityColor(lead.priority),
                        color: 'white',
                        padding: '3px 10px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase',
                        flexShrink: 0,
                        marginLeft: '12px'
                      }}>
                        {lead.priority || 'LOW'}
                      </div>
                    </div>

                    {lead.mentioned_by && (Array.isArray(lead.mentioned_by) ? lead.mentioned_by.length > 0 : Boolean(lead.mentioned_by)) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Mentioned by:</span>
                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: '500' }}>
                          {Array.isArray(lead.mentioned_by) ? lead.mentioned_by.join(', ') : lead.mentioned_by}
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px', flexShrink: 0 }}>
                        Suggested Action:
                      </span>
                      <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '13px', lineHeight: '1.4' }}>
                        {lead.suggested_action}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
