import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { IconSend, IconRobot, IconUser, IconRefresh, IconAlertTriangle, IconSparkles } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } = require('../context/ToastContext');
import Skeleton from '../components/Skeleton';

const STARTER_PROMPTS = [
  "What's expiring this week?",
  "Any low stock items?",
  "Show me sales trend",
  "What's the total inventory value?",
  "Are there any suspicious transactions?",
  "Generate pharmacy health report",
  "Export inventory CSV",
  "Download PDF pharmacy report"
];

function detectExportType(prompt = '') {
  const text = prompt.toLowerCase();

  if (/csv|excel|spreadsheet|xls/.test(text)) return 'csv';
  if (/pdf|report/.test(text)) return 'pdf';
  if (/text file|txt|summary/.test(text)) return 'txt';
  if (/json|api payload|structured data/.test(text)) return 'json';
  if (/chart|graph|visual|dashboard/.test(text)) return 'chart';

  return null;
}

function getExportTitle(prompt = '') {
  const clean = prompt.trim();
  if (!clean) return 'MediHub report';
  const title = clean
    .replace(/^(please|can you|could you|kindly)\s+/i, '')
    .replace(/\b(download|export|generate|create|make)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title || 'MediHub report';
}

async function triggerExportDownload(prompt) {
  const exportType = detectExportType(prompt);
  if (!exportType) return false;

  try {
    const [summaryRes, expiringRes, lowStockRes, salesRes] = await Promise.all([
      api.get('/reports/summary'),
      api.get('/reports/expiring-soon?days=30'),
      api.get('/reports/low-stock'),
      api.get('/reports/sales-trend?days=30')
    ]);

    const summary = summaryRes.data || {};
    const expiring = Array.isArray(expiringRes.data) ? expiringRes.data : [];
    const lowStock = Array.isArray(lowStockRes.data) ? lowStockRes.data : [];
    const salesTrend = Array.isArray(salesRes.data) ? salesRes.data : [];

    const report = {
      title: getExportTitle(prompt),
      summary: {
        total_medicines: summary.total_medicines || 0,
        inventory_value: summary.inventory_value || 0,
        expiring_soon: summary.expiring_soon || expiring.length || 0,
        low_stock: summary.low_stock || lowStock.length || 0,
        total_sales_points: salesTrend.length || 0,
      },
      rows: [
        ...expiring.slice(0, 15).map((item) => ({
          medicine_name: item.medicine_name,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date,
          quantity_remaining: item.quantity_remaining,
          days_left: item.days_left,
          type: 'expiring_soon'
        })),
        ...lowStock.slice(0, 15).map((item) => ({
          medicine_name: item.name,
          reorder_level: item.reorder_level,
          total_remaining: item.total_remaining,
          type: 'low_stock'
        }))
      ],
      recommendations: [
        expiring.length ? `Review ${expiring.length} items expiring soon.` : 'No urgent expiry items identified.',
        lowStock.length ? `Reorder ${lowStock.length} low-stock medicines.` : 'Inventory stock levels look healthy.'
      ],
      trend: salesTrend.map((point) => ({
        label: point.date || point.day || 'Day',
        value: Number(point.units_sold ?? point.items_sold ?? point.total_sold ?? 0)
      }))
    };

    const response = await api.post('/ai/report/export', { type: exportType, report }, { responseType: 'blob' });
    const blob = new Blob([response.data], {
      type: response.headers['content-type'] || 'application/octet-stream'
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${getExportTitle(prompt).replace(/\s+/g, '_').toLowerCase()}.${exportType === 'csv' ? 'csv' : exportType === 'pdf' ? 'pdf' : exportType === 'txt' ? 'txt' : exportType === 'json' ? 'json' : 'json'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);

    return true;
  } catch (err) {
    console.error('Export download failed:', err);
    return false;
  }
}

export default function AiChatModern() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: 'Hello! I\'m MediHub AI, your modern pharmaceutical intelligence assistant. I understand your inventory with context and can explain decisions in plain language. What would you like to know?',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [intention, setIntention] = useState(null);
  const [conversationTurn, setConversationTurn] = useState(0);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation info on mount
  useEffect(() => {
    async function loadConversationInfo() {
      try {
        const res = await api.get('/ai/conversation/info');
        setConversationTurn(res.data.turn_count);
      } catch (err) {
        console.error('Failed to load conversation info:', err);
      }
    }
    loadConversationInfo();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    setLoading(true);
    setStreaming(false);

    try {
      const token = localStorage.getItem('medihub_token');
      if (!token) {
        throw new Error('You are not logged in. Please log in to use AI chat.');
      }

      const exportType = detectExportType(userMessage);
      if (exportType) {
        const started = await triggerExportDownload(userMessage);
        if (started) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Your ${exportType.toUpperCase()} export is downloading now.`,
            timestamp: new Date(),
            isExport: true
          }]);
          addToast(`Download started: ${exportType.toUpperCase()}`, 'success');
          return;
        }
      }

      // Try streaming first for better UX
      const useStreaming = true;

      if (useStreaming) {
        await handleStreamingResponse(userMessage);
      } else {
        await handleNormalResponse(userMessage);
      }
    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to get response. Please try again.';
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMsg,
        timestamp: new Date(),
        isError: true
      }]);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }

  function abortCurrentRequest() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setStreaming(false);
    addToast('Request stopped', 'info');
  }

  async function handleNormalResponse(userMessage) {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const res = await api.post('/ai/chat', { 
      question: userMessage,
      stream: false
    }, { signal: controller.signal });

    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: res.data.response,
      timestamp: new Date(),
      intention: res.data.intention,
      model: res.data.model
    }]);
    setIntention(res.data.intention);
    setConversationTurn(res.data.conversation_turn || conversationTurn + 1);
    abortControllerRef.current = null;
  }

  async function handleStreamingResponse(userMessage) {
    setStreaming(true);
    let fullResponse = '';
    let addedMessage = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('medihub_token')}`
        },
        signal: controller.signal,
        body: JSON.stringify({ 
          question: userMessage,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        if (controller.signal.aborted) {
          break;
        }

        const { done, value } = await reader.read();
        if (done || controller.signal.aborted) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.content) {
                fullResponse += data.content;
                
                // Add message on first chunk
                if (!addedMessage) {
                  setMessages(prev => [...prev, { 
                    role: 'assistant', 
                    content: fullResponse,
                    timestamp: new Date(),
                    isStreaming: true
                  }]);
                  addedMessage = true;
                } else {
                  // Update existing message
                  setMessages(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      ...updated[updated.length - 1],
                      content: fullResponse
                    };
                    return updated;
                  });
                }
              }

              if (data.status === 'completed') {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    isStreaming: false
                  };
                  return updated;
                });
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Request stopped by user.',
          timestamp: new Date(),
          isError: true
        }]);
        return;
      }

      console.error('Streaming error:', err);
      // Fallback to normal response on streaming failure
      await handleNormalResponse(userMessage);
    } finally {
      abortControllerRef.current = null;
      setStreaming(false);
    }
  }

  function handleStarterPrompt(prompt) {
    setInput(prompt);
  }

  async function clearChat() {
    try {
      await api.post('/ai/conversation/clear');
      setMessages([
        { 
          role: 'assistant', 
          content: 'Hello! I\'m MediHub AI, your modern pharmaceutical intelligence assistant. Conversation history cleared. How can I help?',
          timestamp: new Date()
        }
      ]);
      setConversationTurn(0);
      setIntention(null);
      addToast('Conversation cleared', 'success');
    } catch (err) {
      addToast('Failed to clear conversation', 'error');
    }
  }

  async function getHealthReport() {
    setLoading(true);
    try {
      const res = await api.get('/ai/health-report');
      const healthReport = res.data.health_report;
      setMessages(prev => [...prev, 
        { role: 'user', content: 'Generate pharmacy health report', timestamp: new Date() },
        { 
          role: 'assistant', 
          content: healthReport,
          timestamp: new Date(),
          isHealthReport: true
        }
      ]);
    } catch (err) {
      addToast('Failed to generate health report', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.2rem, 1.8vw, 1.55rem)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconSparkles size={24} />
            MediHub AI Assistant
          </h1>
          <p style={{ color: 'var(--steel)', margin: '4px 0 0', fontSize: 13 }}>
            Modern pharmaceutical intelligence · Turn {conversationTurn + 1} {intention && `· Discussing ${intention.replace(/_/g, ' ')}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={getHealthReport} disabled={loading}>
            <IconSparkles size={15} /> Health Report
          </button>
          <button className="btn btn-secondary" onClick={clearChat}>
            <IconRefresh size={15} /> Clear
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', minHeight: 500 }}>
        {/* Messages Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                alignItems: 'flex-start',
                gap: 12
              }}
            >
              {msg.role === 'assistant' && (
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <IconRobot size={18} color="white" />
                </div>
              )}

              <div
                style={{
                  maxWidth: '70%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: msg.role === 'user' 
                    ? 'var(--primary)' 
                    : msg.isError 
                    ? '#fee' 
                    : 'var(--card-bg)',
                  color: msg.role === 'user' ? 'white' : 'inherit',
                  border: msg.isError ? '1px solid #fcc' : 'none',
                  wordWrap: 'break-word',
                  fontSize: 14,
                  lineHeight: 1.5
                }}
              >
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h3 style={{fontSize: '16px', fontWeight: 700, margin: '12px 0 8px', color: 'var(--primary)'}} {...props} />,
                      h2: ({node, ...props}) => <h3 style={{fontSize: '15px', fontWeight: 700, margin: '10px 0 6px', color: 'var(--primary)'}} {...props} />,
                      h3: ({node, ...props}) => <h4 style={{fontSize: '14px', fontWeight: 700, margin: '8px 0 4px', color: 'var(--primary)'}} {...props} />,
                      strong: ({node, ...props}) => <strong style={{fontWeight: 700}} {...props} />,
                      em: ({node, ...props}) => <em style={{fontStyle: 'italic', opacity: 0.9}} {...props} />,
                      ul: ({node, ...props}) => <ul style={{marginLeft: '20px', marginTop: '6px', marginBottom: '6px'}} {...props} />,
                      ol: ({node, ...props}) => <ol style={{marginLeft: '20px', marginTop: '6px', marginBottom: '6px'}} {...props} />,
                      li: ({node, ...props}) => <li style={{marginBottom: '4px'}} {...props} />,
                      blockquote: ({node, ...props}) => <blockquote style={{marginLeft: '12px', paddingLeft: '12px', borderLeft: '3px solid var(--primary)', opacity: 0.95, fontStyle: 'italic'}} {...props} />,
                      code: ({node, inline, ...props}) => inline ? 
                        <code style={{background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px'}} {...props} /> :
                        <code style={{display: 'block', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '6px', overflow: 'auto', margin: '8px 0', fontFamily: 'monospace', fontSize: '12px'}} {...props} />
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <>
                    {msg.content}
                    {msg.isStreaming && <span style={{ animation: 'blink 1s infinite' }}>▌</span>}
                  </>
                )}
              </div>

              {msg.role === 'user' && (
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'var(--steel-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <IconUser size={18} />
                </div>
              )}
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Starter Prompts */}
        {messages.length === 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}
          >
            {STARTER_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleStarterPrompt(prompt)}
                style={{
                  padding: 12,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  background: 'var(--bg)',
                  cursor: 'pointer',
                  fontSize: 13,
                  transition: 'all 0.2s',
                  ':hover': { borderColor: 'var(--primary)' }
                }}
              >
                {prompt}
              </button>
            ))}
          </motion.div>
        )}

        {/* Input Area */}
        <form onSubmit={handleSubmit} style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={streaming ? 'Receiving response...' : 'Ask about your inventory...'}
            disabled={loading || streaming}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 14,
              fontFamily: 'inherit'
            }}
          />
          {loading || streaming ? (
            <button
              type="button"
              onClick={abortCurrentRequest}
              style={{
                padding: '10px 16px',
                background: '#b42318',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600
              }}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              style={{
                padding: '10px 16px',
                background: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: !input.trim() ? 0.6 : 1
              }}
            >
              <IconSend size={18} />
            </button>
          )}
        </form>
      </div>

      <style>{`
        @keyframes blink {
          0%, 49%, 100% { opacity: 1; }
          50%, 99% { opacity: 0; }
        }
      `}</style>
    </motion.div>
  );
}
