import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { IconSend, IconRobot, IconUser, IconRefresh, IconAlertTriangle } from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Skeleton from '../components/Skeleton';

const STARTER_PROMPTS = [
  "What's expiring this week?",
  "Any low stock items?",
  "Show me sales trend",
  "What's the total inventory value?",
];

export default function AiChat() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m your MediHub AI assistant. Ask me anything about your inventory, expiry dates, stock levels, or sales data.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function abortCurrentRequest() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    addToast('Request stopped', 'info');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Check if user is authenticated
      const token = localStorage.getItem('medihub_token');
      if (!token) {
        throw new Error('You are not logged in. Please log in to use AI chat.');
      }
      
      console.log('Sending AI chat request with token:', token ? 'Present' : 'Missing');
      const res = await api.post('/ai/chat', { question: userMessage }, { signal: controller.signal });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Request stopped by user.', isError: true }]);
        return;
      }

      console.error('Chat error:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to get response. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleStarterPrompt(prompt) {
    setInput(prompt);
  }

  function clearChat() {
    setMessages([
      { role: 'assistant', content: 'Hello! I\'m your MediHub AI assistant. Ask me anything about your inventory, expiry dates, stock levels, or sales data.' }
    ]);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.2rem, 1.8vw, 1.55rem)' }}>AI Assistant</h1>
          <p style={{ color: 'var(--steel)', margin: '4px 0 0', fontSize: 13 }}>
            Ask questions about your inventory, expiry, stock levels, and sales
          </p>
        </div>
        <button className="btn btn-secondary" onClick={clearChat}>
          <IconRefresh size={15} /> Clear Chat
        </button>
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
                gap: 12,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                maxWidth: '80%',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: msg.role === 'user' ? 'var(--gradient-primary)' : 'var(--bg-subtle)',
                  color: msg.role === 'user' ? '#fff' : 'var(--ink)',
                }}
              >
                {msg.role === 'user' ? <IconUser size={18} /> : <IconRobot size={18} />}
              </div>
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 16,
                  background: msg.role === 'user' ? 'var(--gradient-primary)' : 'var(--bg-subtle)',
                  color: msg.role === 'user' ? '#fff' : 'var(--ink)',
                  fontSize: 14,
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                  borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 16,
                  borderBottomRightRadius: msg.role === 'user' ? 4 : 16,
                  maxWidth: '100%',
                }}
                className="markdown-message"
              >
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h3 style={{fontSize: '16px', fontWeight: 700, margin: '12px 0 8px', color: 'var(--amber)'}} {...props} />,
                      h2: ({node, ...props}) => <h3 style={{fontSize: '15px', fontWeight: 700, margin: '10px 0 6px', color: 'var(--amber)'}} {...props} />,
                      h3: ({node, ...props}) => <h4 style={{fontSize: '14px', fontWeight: 700, margin: '8px 0 4px', color: 'var(--amber)'}} {...props} />,
                      strong: ({node, ...props}) => <strong style={{fontWeight: 700, color: msg.role === 'user' ? '#fff' : 'var(--ink)'}} {...props} />,
                      em: ({node, ...props}) => <em style={{fontStyle: 'italic', opacity: 0.9}} {...props} />,
                      ul: ({node, ...props}) => <ul style={{marginLeft: '20px', marginTop: '6px', marginBottom: '6px'}} {...props} />,
                      ol: ({node, ...props}) => <ol style={{marginLeft: '20px', marginTop: '6px', marginBottom: '6px'}} {...props} />,
                      li: ({node, ...props}) => <li style={{marginBottom: '4px'}} {...props} />,
                      blockquote: ({node, ...props}) => <blockquote style={{marginLeft: '12px', paddingLeft: '12px', borderLeft: '3px solid var(--amber)', opacity: 0.95, fontStyle: 'italic'}} {...props} />,
                      code: ({node, inline, ...props}) => inline ? 
                        <code style={{background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '12px'}} {...props} /> :
                        <code style={{display: 'block', background: 'rgba(0,0,0,0.1)', padding: '12px', borderRadius: '6px', overflow: 'auto', margin: '8px 0', fontFamily: 'monospace', fontSize: '12px'}} {...props} />
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            </motion.div>
          ))}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--bg-subtle)',
                  color: 'var(--ink)',
                }}
              >
                <IconRobot size={18} />
              </div>
              <div style={{ padding: '12px 16px', borderRadius: 16, background: 'var(--bg-subtle)' }}>
                <Skeleton width={100} height={16} />
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Starter Prompts */}
        {messages.length === 1 && !loading && (
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--steel)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Suggested questions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleStarterPrompt(prompt)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 20,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--ink)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'var(--bg-subtle)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'transparent';
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        <div style={{ padding: 16, borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={loading ? 'AI request in progress...' : 'Ask about inventory, expiry, stock levels...'}
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: 24,
                border: '1px solid var(--border)',
                fontSize: 14,
                background: 'var(--bg-subtle)',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--amber)';
                e.target.style.boxShadow = '0 0 0 3px rgba(214, 158, 46, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)';
                e.target.style.boxShadow = 'none';
              }}
            />
            {loading ? (
              <button
                type="button"
                onClick={abortCurrentRequest}
                className="btn btn-danger"
                style={{ borderRadius: 24, padding: '12px 20px', background: '#b42318', color: '#fff' }}
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="btn btn-primary"
                style={{ borderRadius: 24, padding: '12px 20px' }}
              >
                <IconSend size={16} />
              </button>
            )}
          </form>
        </div>
      </div>
    </motion.div>
  );
}
