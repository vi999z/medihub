import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { IconSend, IconRobot, IconUser, IconRefresh, IconAlertTriangle, IconSparkles, IconPaperclip, IconX, IconPhoto } from '@tabler/icons-react';
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
  "Are there any suspicious transactions?",
  "Generate pharmacy health report",
  "What medicines should I restock for the rainy season?",
  "Check weather-driven demand — which items might run out?",
  "Export inventory CSV",
  "Download PDF pharmacy report"
];

function detectExportType(prompt = '') {
  const text = prompt.toLowerCase();

  if (/word|docx|document/.test(text)) return 'docx';
  if (/csv|excel|spreadsheet|xls/.test(text)) return 'csv';
  if (/pdf/.test(text)) return 'pdf';
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
    if (exportType === 'pdf' || exportType === 'docx') {
      const response = await api.post('/ai/auto-generate-file', { question: prompt }, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream'
      });
      const contentDisposition = response.headers['content-disposition'] || '';
      const serverFilename = contentDisposition.match(/filename="?([^";]+)"?/)?.[1];
      const filename = serverFilename || `${getExportTitle(prompt).replace(/\s+/g, '_').toLowerCase()}.${exportType}`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      return true;
    }

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
    const extension = exportType === 'csv' ? 'csv'
      : exportType === 'pdf' ? 'pdf'
      : exportType === 'docx' ? 'docx'
      : exportType === 'txt' ? 'txt'
      : exportType === 'json' ? 'json'
      : 'json';
    link.download = `${getExportTitle(prompt).replace(/\s+/g, '_').toLowerCase()}.${extension}`;
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
  const [pendingImage, setPendingImage] = useState(null); // { base64, mimeType, previewUrl }
  // Persistent conversation state
  const [savedConversations, setSavedConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addToast('Please select an image file', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast('Image must be under 10 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Strip the data:<mime>;base64, prefix
      const base64 = dataUrl.split(',')[1];
      setPendingImage({ base64, mimeType: file.type, previewUrl: dataUrl, fileName: file.name });
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  function clearPendingImage() {
    setPendingImage(null);
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation info and saved conversations on mount
  useEffect(() => {
    async function loadOnMount() {
      try {
        const [infoRes, convsRes] = await Promise.all([
          api.get('/ai/conversation/info'),
          api.get('/ai/conversations')
        ]);
        setConversationTurn(infoRes.data.turn_count);
        setSavedConversations(convsRes.data.conversations || []);
      } catch (err) {
        console.error('Failed to load on mount:', err);
      }
    }
    loadOnMount();
  }, []);

  async function loadConversationList() {
    try {
      const res = await api.get('/ai/conversations');
      setSavedConversations(res.data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  async function saveCurrentConversation() {
    if (messages.length <= 1) { addToast('Nothing to save yet', 'info'); return; }
    try {
      // Auto-title from first user message
      const firstUser = messages.find(m => m.role === 'user');
      const autoTitle = firstUser ? firstUser.content.slice(0, 60) : 'Conversation';
      const res = await api.post('/ai/conversations', {
        id: activeConvId || undefined,
        title: autoTitle,
        messages
      });
      setActiveConvId(res.data.id);
      await loadConversationList();
      addToast('Conversation saved', 'success');
    } catch (err) {
      addToast('Failed to save conversation', 'error');
    }
  }

  async function loadSavedConversation(conv) {
    try {
      const res = await api.get(`/ai/conversations/${conv.id}`);
      const loaded = res.data.messages || [];
      setMessages(loaded.length ? loaded : [{
        role: 'assistant',
        content: 'Hello! I\'m MediHub AI. What would you like to know?',
        timestamp: new Date()
      }]);
      setActiveConvId(conv.id);
      setConversationTurn(Math.floor(loaded.filter(m => m.role === 'user').length));
      setIntention(null);
      // Also restore the in-memory context by clearing server-side session
      await api.post('/ai/conversation/clear');
    } catch (err) {
      addToast('Failed to load conversation', 'error');
    }
  }

  async function deleteSavedConversation(convId, e) {
    e.stopPropagation();
    try {
      await api.delete(`/ai/conversations/${convId}`);
      if (activeConvId === convId) {
        setActiveConvId(null);
      }
      await loadConversationList();
      addToast('Conversation deleted', 'success');
    } catch (err) {
      addToast('Failed to delete conversation', 'error');
    }
  }

  function startNewConversation() {
    setMessages([{
      role: 'assistant',
      content: 'Hello! I\'m MediHub AI, your modern pharmaceutical intelligence assistant. What would you like to know?',
      timestamp: new Date()
    }]);
    setActiveConvId(null);
    setInput('');
    setPendingImage(null);
    setIntention(null);
    setConversationTurn(0);
    api.post('/ai/conversation/clear').catch(() => {});
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if ((!input.trim() && !pendingImage) || loading) return;

    const userMessage = input.trim();
    const imageToSend = pendingImage;
    setInput('');
    setPendingImage(null);
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      image: imageToSend ? imageToSend.previewUrl : null
    }]);
    setLoading(true);
    setStreaming(false);

    try {
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

      // Streaming is not supported by the current /api/ai/chat endpoint;
      // use the normal (non-streaming) path.
      const useStreaming = false;

      if (useStreaming) {
        await handleStreamingResponse(userMessage, imageToSend);
      } else {
        await handleNormalResponse(userMessage, imageToSend);
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

  async function handleNormalResponse(userMessage, imageData = null) {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const body = { question: userMessage, stream: false };
    if (imageData) {
      body.image_base64 = imageData.base64;
      body.mime_type = imageData.mimeType;
    }

    const res = await api.post('/ai/chat', body, { signal: controller.signal });
    const responseText = res?.data?.response || res?.data?.error || 'AI service returned an empty response. Please try again.';

    setMessages(prev => [...prev, { 
      role: 'assistant', 
      content: responseText,
      timestamp: new Date(),
      intention: res?.data?.intention,
      model: res?.data?.model
    }]);
    setIntention(res?.data?.intention);
    setConversationTurn(res?.data?.conversation_turn || conversationTurn + 1);
    abortControllerRef.current = null;
  }

  async function handleStreamingResponse(userMessage, imageData = null) {
    setStreaming(true);
    let fullResponse = '';
    let addedMessage = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const streamBody = { question: userMessage, stream: true };
      if (imageData) {
        streamBody.image_base64 = imageData.base64;
        streamBody.mime_type = imageData.mimeType;
      }

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('medihub_token')}`,
        },
        signal: controller.signal,
        body: JSON.stringify(streamBody)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 'clamp(1.2rem, 1.8vw, 1.55rem)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconSparkles size={24} />
            MediHub AI Assistant
          </h1>
          <p style={{ color: 'var(--steel)', margin: '4px 0 0', fontSize: 13 }}>
            Modern pharmaceutical intelligence · Turn {conversationTurn + 1} {intention && `· Discussing ${intention.replace(/_/g, ' ')}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={startNewConversation} title="Start a fresh conversation">
            + New
          </button>
          <button className="btn btn-secondary" onClick={saveCurrentConversation} disabled={loading || messages.length <= 1} title="Save this conversation">
            💾 Save
          </button>
          <button className="btn btn-secondary" onClick={getHealthReport} disabled={loading}>
            <IconSparkles size={15} /> Health Report
          </button>
          <button className="btn btn-secondary" onClick={clearChat}>
            <IconRefresh size={15} /> Clear
          </button>
        </div>
      </div>

      {/* Main layout: sidebar + chat */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Conversation History Sidebar ── */}
        {sidebarOpen && (
          <div style={{
            width: 220, flexShrink: 0,
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            display: 'flex', flexDirection: 'column',
            height: 'calc(100vh - 200px)', minHeight: 500,
            overflow: 'hidden'
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Conversations</span>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--steel)', fontSize: 16, lineHeight: 1, padding: 2 }}
                title="Hide sidebar"
              >×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
              {savedConversations.length === 0 ? (
                <p style={{ color: 'var(--steel)', fontSize: 12, padding: '8px 4px', textAlign: 'center' }}>No saved conversations yet.<br/>Click 💾 Save after chatting.</p>
              ) : (
                savedConversations.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => loadSavedConversation(conv)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 7,
                      cursor: 'pointer',
                      background: activeConvId === conv.id ? 'var(--primary)' : 'transparent',
                      color: activeConvId === conv.id ? 'white' : 'inherit',
                      marginBottom: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 6,
                      transition: 'background 0.15s'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {conv.title}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>
                        {new Date(conv.updated_at).toLocaleDateString()} · {conv.message_count || 0} msgs
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteSavedConversation(conv.id, e)}
                      title="Delete"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: activeConvId === conv.id ? 'rgba(255,255,255,0.7)' : 'var(--steel)',
                        flexShrink: 0, padding: '2px 4px', fontSize: 14, lineHeight: 1
                      }}
                    >×</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ alignSelf: 'flex-start', marginTop: 4, padding: '8px 10px', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--steel)', flexShrink: 0 }}
            title="Show conversation history"
          >
            📋
          </button>
        )}

        {/* ── Chat Panel ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

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
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="uploaded"
                        style={{ display: 'block', maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: msg.content ? 8 : 0, objectFit: 'contain' }}
                      />
                    )}
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
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {/* Image preview strip */}
          {pendingImage && (
            <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                <img
                  src={pendingImage.previewUrl}
                  alt="pending upload"
                  style={{ height: 56, width: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                />
                <button
                  type="button"
                  onClick={clearPendingImage}
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#b42318', color: 'white', border: 'none',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0, fontSize: 10
                  }}
                >
                  <IconX size={11} />
                </button>
              </div>
              <span style={{ fontSize: 12, color: 'var(--steel)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pendingImage.fileName}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageSelect}
            />
            {/* Paperclip button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || streaming}
              title="Attach image"
              style={{
                padding: '10px',
                background: pendingImage ? 'var(--primary)' : 'var(--card-bg)',
                color: pendingImage ? 'white' : 'var(--steel)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: loading || streaming ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                opacity: loading || streaming ? 0.5 : 1
              }}
            >
              <IconPaperclip size={18} />
            </button>

            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={streaming ? 'Receiving response...' : pendingImage ? 'Describe the image or ask a question...' : 'Ask about your inventory...'}
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
                disabled={!input.trim() && !pendingImage}
                style={{
                  padding: '10px 16px',
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: (!input.trim() && !pendingImage) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: (!input.trim() && !pendingImage) ? 0.6 : 1
                }}
              >
                <IconSend size={18} />
              </button>
            )}
          </form>
        </div>
      </div>
        </div> {/* end chat panel */}
      </div> {/* end flex row */}

      <style>{`
        @keyframes blink {
          0%, 49%, 100% { opacity: 1; }
          50%, 99% { opacity: 0; }
        }
      `}</style>
    </motion.div>
  );
}
