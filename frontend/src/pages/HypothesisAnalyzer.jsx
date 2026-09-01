import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, X, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';
import AppShell from '../components/layout/AppShell';
import Spinner from '../components/loading/Spinner';
import SkeletonCard from '../components/loading/SkeletonCard';
import { apiClient } from '../api/client';

const HypothesisAnalyzer = () => {
  const { caseId } = useParams();
  const navigate = useNavigate();
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  
  const [hypotheses, setHypotheses] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  
  const [expandedEvidence, setExpandedEvidence] = useState({});
  const [expandedQuestions, setExpandedQuestions] = useState({});

  const fetchHypotheses = async () => {
    setListLoading(true);
    try {
      const data = await apiClient(`/hypotheses/cases/${caseId}`);
      setHypotheses(data.hypotheses || []);
    } catch (err) {
      console.error(err);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    fetchHypotheses();
  }, [caseId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !description) {
      setFormError('Please fill in all fields.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await apiClient(`/hypotheses/cases/${caseId}`, {
        method: 'POST',
        body: JSON.stringify({ title, description })
      });
      setTitle('');
      setDescription('');
      fetchHypotheses();
    } catch (err) {
      setFormError(err.message || 'Failed to submit hypothesis.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient(`/hypotheses/cases/${caseId}/${id}`, {
        method: 'DELETE'
      });
      fetchHypotheses();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleEvidence = (id) => {
    setExpandedEvidence(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleQuestions = (id) => {
    setExpandedQuestions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getScoreColor = (score) => {
    if (score <= 40) return 'var(--critical)';
    if (score <= 65) return 'var(--warning)';
    return 'var(--success)';
  };

  return (
    <AppShell>
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
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
            marginBottom: '20px'
          }}
        >
          <ArrowLeft size={16} />
          ← Back to Case
        </button>

        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '28px', margin: '0 0 8px 0' }}>
          Case Hypothesis Analyzer
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '0 0 32px 0' }}>
          Test theories against collected evidence. No legal conclusions are made.
        </p>

        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          marginBottom: '32px'
        }}>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '16px', margin: '0 0 20px 0' }}>
            Add New Hypothesis
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="e.g. The robbery was planned in advance"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-muted)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <textarea
                placeholder="Describe your hypothesis in detail..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-muted)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  resize: 'vertical',
                  lineHeight: 1.6,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {submitting ? (
                <>
                  <Spinner size="small" color="#fff" />
                  Analyzing against all evidence...
                </>
              ) : (
                'Analyze Hypothesis'
              )}
            </button>
            {formError && (
              <div style={{ color: 'var(--danger)', fontSize: '14px', marginTop: '12px' }}>
                {formError}
              </div>
            )}
          </form>
        </div>

        <div>
          {listLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : hypotheses.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '14px' }}>
              No hypotheses tested yet. Add one above.
            </div>
          ) : (
            hypotheses.map(hyp => (
              <div
                key={hyp.id}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '20px',
                  marginBottom: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: '16px', margin: 0 }}>
                    {hyp.title}
                  </h3>
                  <button
                    onClick={() => handleDelete(hyp.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: 'var(--bg-muted)',
                    borderRadius: '999px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      borderRadius: '999px',
                      width: `${hyp.confidence_score}%`,
                      background: getScoreColor(hyp.confidence_score),
                      transition: 'width 0.5s ease-in-out'
                    }} />
                  </div>
                  <div style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '12px',
                    color: getScoreColor(hyp.confidence_score),
                    marginTop: '6px'
                  }}>
                    {hyp.confidence_score}% evidence support
                  </div>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <p style={{
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    margin: 0
                  }}>
                    {hyp.ai_explanation}
                  </p>
                  <p style={{
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    marginTop: '8px',
                    marginBottom: 0
                  }}>
                    ForensIQ does not make legal determinations. This is an evidence-based assessment only.
                  </p>
                </div>

                <div style={{ marginTop: '12px' }}>
                  <button
                    onClick={() => toggleEvidence(hyp.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent)',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {expandedEvidence[hyp.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Evidence Breakdown
                  </button>
                  
                  {expandedEvidence[hyp.id] && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '12px',
                      marginTop: '12px'
                    }}>
                      <div>
                        <div style={{ color: 'var(--success)', fontWeight: 600, fontSize: '12px', marginBottom: '8px' }}>
                          SUPPORTING ({hyp.supporting_evidence?.length || 0})
                        </div>
                        {hyp.supporting_evidence?.map((ev, i) => (
                          <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            • {ev.filename} {ev.label && `(${ev.label})`}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '12px', marginBottom: '8px' }}>
                          CONTRADICTING ({hyp.contradicting_evidence?.length || 0})
                        </div>
                        {hyp.contradicting_evidence?.map((ev, i) => (
                          <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            • {ev.filename} {ev.label && `(${ev.label})`}
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '12px', marginBottom: '8px' }}>
                          NEUTRAL ({hyp.neutral_evidence?.length || 0})
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {hyp.unresolved && hyp.unresolved.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <button
                      onClick={() => toggleQuestions(hyp.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent)',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {expandedQuestions[hyp.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      Unresolved Questions
                    </button>
                    
                    {expandedQuestions[hyp.id] && (
                      <ul style={{
                        marginTop: '12px',
                        paddingLeft: '0',
                        listStyle: 'none',
                        margin: '12px 0 0 0'
                      }}>
                        {hyp.unresolved.map((q, i) => (
                          <li key={i} style={{
                            color: 'var(--warning)',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '6px',
                            marginBottom: '6px'
                          }}>
                            <HelpCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{q}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default HypothesisAnalyzer;
