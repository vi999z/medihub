import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { IconSend, IconRobot, IconUser, IconRefresh, IconAlertTriangle, IconSparkles } from '@tabler/icons-react';
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
  "Generate pharmacy health report"
];

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

  async function handleNormalResponse(userMessage) {
    const res = await api.post('/ai/chat', { 
      question: userMessage,
      stream: false
    });

    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: res.data.response,
      timestamp: new Date(),
      intention: res.data.intention,
      model: res.data.model
    }]);
    setIntention(res.data.intention);
    setConversationTurn(res.data.conversation_turn || conversationTurn + 1);
  }

  async function handleStreamingResponse(userMessage) {
    setStreaming(true);
    let fullResponse = '';
    let addedMessage = false;

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('medihub_token')}`
        },
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
        const { done, value } = await reader.read();
        if (done) break;

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
      console.error('Streaming error:', err);
      // Fallback to normal response on streaming failure
      await handleNormalResponse(userMessage);
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
                  whiteSpace: 'pre-wrap',
                  fontSize: 14,
                  lineHeight: 1.5
                }}
              >
                {msg.content}
                {msg.isStreaming && <span style={{ animation: 'blink 1s infinite' }}>▌</span>}
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
          <button
            type="submit"
            disabled={loading || streaming || !input.trim()}
            style={{
              padding: '10px 16px',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: loading || streaming ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: loading || streaming ? 0.6 : 1
            }}
          >
            {loading || streaming ? <Skeleton width={16} height={16} /> : <IconSend size={18} />}
          </button>
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
