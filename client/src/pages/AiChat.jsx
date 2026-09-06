import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  IconSend, IconRobot, IconUser, IconRefresh, IconPlus,
  IconTrash, IconDownload, IconPencil, IconCheck, IconX,
  IconMessage, IconPaperclip, IconPhoto,
} from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../api/axios';
import { useToast } from '../context/ToastContext';
import Skeleton from '../components/Skeleton';

const STARTER_PROMPTS = [
  "What's expiring this week?",
  "Any low stock items?",
  "Show me sales trend",
  "What's the total inventory value?",
];

const BLANK_MESSAGES = [
  { role: 'assistant', content: "Hello! I'm your MediHub AI assistant. Ask me anything about your inventory, expiry dates, stock levels, or sales data." }
];

function ChatVisualization({ visualization }) {
  if (!visualization?.data?.length) return null;

  const chart = visualization.type === 'line' ? (
    <LineChart data={visualization.data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
      <Tooltip />
      <Line type="monotone" dataKey="value" stroke="var(--amber)" strokeWidth={2} dot={false} />
    </LineChart>
  ) : (
    <BarChart data={visualization.data} layout={visualization.data.length > 4 ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      {visualization.data.length > 4 ? <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} /> : <XAxis dataKey="label" tick={{ fontSize: 10 }} />}
      {visualization.data.length > 4 ? <YAxis dataKey="label" type="category" width={90} tick={{ fontSize: 10 }} /> : <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />}
      <Tooltip />
      <Bar dataKey="value" fill="var(--amber)" radius={[3, 3, 0, 0]} />
    </BarChart>
  );

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, color: 'var(--steel)' }}>{visualization.title}</div>
      <div style={{ width: '100%', height: 190 }}>
        <ResponsiveContainer>{chart}</ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Markdown renderer config ───
const MD_COMPONENTS = {
  h1: ({ node, ...p }) => <h3 style={{ fontSize: 16, fontWeight: 700, margin: '12px 0 8px', color: 'var(--amber)' }} {...p} />,
  h2: ({ node, ...p }) => <h3 style={{ fontSize: 15, fontWeight: 700, margin: '10px 0 6px', color: 'var(--amber)' }} {...p} />,
  h3: ({ node, ...p }) => <h4 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 4px', color: 'var(--amber)' }} {...p} />,
  strong: ({ node, ...p }) => <strong style={{ fontWeight: 700 }} {...p} />,
  em: ({ node, ...p }) => <em style={{ fontStyle: 'italic', opacity: 0.9 }} {...p} />,
  ul: ({ node, ...p }) => <ul style={{ marginLeft: 20, marginTop: 6, marginBottom: 6 }} {...p} />,
  ol: ({ node, ...p }) => <ol style={{ marginLeft: 20, marginTop: 6, marginBottom: 6 }} {...p} />,
  li: ({ node, ...p }) => <li style={{ marginBottom: 4 }} {...p} />,
  blockquote: ({ node, ...p }) => <blockquote style={{ marginLeft: 12, paddingLeft: 12, borderLeft: '3px solid var(--amber)', opacity: 0.95, fontStyle: 'italic' }} {...p} />,
  code: ({ node, inline, ...p }) => inline
    ? <code style={{ background: 'rgba(0,0,0,0.08)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }} {...p} />
    : <code style={{ display: 'block', background: 'rgba(0,0,0,0.08)', padding: 12, borderRadius: 6, overflow: 'auto', margin: '8px 0', fontFamily: 'monospace', fontSize: 12 }} {...p} />,
};

// ─── Download button ───
const MIME_MAP = {
  csv:   'text/csv; charset=utf-8',
  txt:   'text/plain; charset=utf-8',
  json:  'application/json; charset=utf-8',
};

// Binary formats (excel, word, pdf) come back as binary responses from the server
// and are handled separately — they never go through triggerDownload directly.
function triggerDownload(data, fileType, filename) {
  const mime = MIME_MAP[fileType] || 'application/octet-stream';
  const content = data instanceof ArrayBuffer || data instanceof Uint8Array
    ? data
    : (typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const BINARY_TYPES = new Set(['excel', 'xlsx', 'word', 'docx', 'pdf']);

function DownloadButton({ fileRequest, messageContent }) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);
  const fileType = fileRequest.file_type;
  const filename = fileRequest.filename || `medihub_export.${fileType}`;

  async function handleDownload() {
    setBusy(true);
    try {
      const isBinary = BINARY_TYPES.has(fileType);

      if (fileRequest.content && !isBinary) {
        // Text content already extracted — download directly
        triggerDownload(fileRequest.content, fileType, filename);
        addToast(`Downloaded ${filename}`, 'success');
        return;
      }

      // Binary formats (xlsx, docx, pdf) or no inline content — call the server
      // The server streams a binary buffer so use fetch directly (axios would need responseType)
      const token = document.cookie.match(/token=([^;]+)/)?.[1]
        || localStorage.getItem('token')
        || sessionStorage.getItem('token');

      const res = await fetch('/api/ai/generate-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          file_type: fileType,
          // Pass the AI-generated text content (will be parsed server-side)
          content: fileRequest.content || messageContent || '',
          filename,
        }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const contentDisp = res.headers.get('content-disposition') || '';
      const serverName  = contentDisp.match(/filename="?([^"]+)"?/)?.[1] || filename;

      const buffer = await res.arrayBuffer();
      triggerDownload(buffer, fileType, serverName);
      addToast(`Downloaded ${serverName}`, 'success');
    } catch {
      addToast('Download failed. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={busy}
      style={{
        marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '7px 14px', borderRadius: 20, border: '1px solid var(--amber)',
        background: 'var(--amber-tint)', color: 'var(--amber)', fontSize: 12,
        fontWeight: 600, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <IconDownload size={13} stroke={2} />
      {busy ? 'Preparing…' : `Download ${fileRequest.file_type.toUpperCase()}`}
    </button>
  );
}

// ─── Streaming typing cursor ───
function TypingCursor() {
  return (
    <span style={{ display: 'inline-block', width: 2, height: '1em', background: 'var(--amber)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink-cursor 0.9s step-end infinite' }} />
  );
}

// ─── Conversation sidebar item ───
function ConvItem({ conv, active, onSelect, onDelete, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitRename() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== conv.title) onRename(conv.id, trimmed);
    setEditing(false);
  }

  return (
    <div
      onClick={() => !editing && onSelect(conv.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        borderRadius: 10, cursor: 'pointer',
        background: active ? 'var(--amber-tint)' : 'transparent',
        border: active ? '1px solid var(--amber)' : '1px solid transparent',
        transition: 'all 0.15s', marginBottom: 2,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-subtle)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <IconMessage size={13} stroke={1.8} style={{ flexShrink: 0, color: active ? 'var(--amber)' : 'var(--steel)' }} />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, fontSize: 12, border: 'none', background: 'transparent', outline: 'none', color: 'var(--ink)' }}
        />
      ) : (
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: active ? 'var(--amber)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {conv.title}
        </span>
      )}

      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        {editing ? (
          <>
            <button onClick={commitRename} style={iconBtnStyle}><IconCheck size={11} stroke={2} /></button>
            <button onClick={() => setEditing(false)} style={iconBtnStyle}><IconX size={11} stroke={2} /></button>
          </>
        ) : (
          <>
            <button onClick={() => { setDraft(conv.title); setEditing(true); }} style={iconBtnStyle}><IconPencil size={11} stroke={1.8} /></button>
            <button onClick={() => onDelete(conv.id)} style={{ ...iconBtnStyle, color: 'var(--red)' }}><IconTrash size={11} stroke={1.8} /></button>
          </>
        )}
      </div>
    </div>
  );
}

const iconBtnStyle = {
  background: 'none', border: 'none', padding: '2px 3px', borderRadius: 4,
  cursor: 'pointer', color: 'var(--steel)', display: 'flex', alignItems: 'center',
  transition: 'color 0.15s',
};

// ─── Main page ───
export default function AiChat() {
  const { addToast } = useToast();
  const prefersReducedMotion = useReducedMotion();

  // Chat state
  const [messages, setMessages] = useState(BLANK_MESSAGES);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');  // token-by-token SSE buffer
  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Image attachment state
  const [attachedImage, setAttachedImage] = useState(null); // { base64, mimeType, previewUrl }
  const fileInputRef = useRef(null);

  // Conversation history state
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const activeConvIdRef = useRef(null);   // always mirrors activeConvId synchronously
  const [convLoading, setConvLoading] = useState(true);

  // ─── Scroll to bottom on new messages / streaming ───
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => { loadConversations(); }, []);

  // ─── Inject blink-cursor keyframe once ───
  useEffect(() => {
    if (document.getElementById('ai-chat-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-chat-styles';
    style.textContent = `@keyframes blink-cursor { 0%,100%{opacity:1} 50%{opacity:0} }`;
    document.head.appendChild(style);
  }, []);

  async function loadConversations() {
    try {
      const res = await api.get('/ai/conversations');
      setConversations(res.data.conversations || []);
    } catch {
      // non-fatal
    } finally {
      setConvLoading(false);
    }
  }

  async function selectConversation(id) {
    if (id === activeConvId) return;
    try {
      const res = await api.get(`/ai/conversations/${id}`);
      // Always prepend the greeting so it shows at the top, but strip any
      // persisted greeting from the DB to avoid duplication.
      const loaded = (res.data.messages || []).filter(
        m => m.content !== BLANK_MESSAGES[0].content
      );
      setMessages(loaded.length ? [...BLANK_MESSAGES, ...loaded] : BLANK_MESSAGES);
      activeConvIdRef.current = id;
      setActiveConvId(id);
    } catch {
      addToast('Could not load conversation', 'error');
    }
  }

  async function newChat() {
    setMessages(BLANK_MESSAGES);
    activeConvIdRef.current = null;
    setActiveConvId(null);
    setInput('');
    setAttachedImage(null);
    setStreamingText('');
    // Clear the server-side conversation context so the AI starts fresh
    try { await api.delete('/ai/conversation'); } catch { /* non-fatal */ }
  }

  const saveConversation = useCallback(async (msgs, convId) => {
    // Strip the static greeting before saving — it's always re-prepended on load
    // so we never want it stored (prevents duplication on reload).
    const saveable = msgs.filter(m => m !== BLANK_MESSAGES[0] && m.content !== BLANK_MESSAGES[0].content);
    if (saveable.length === 0) return { id: convId, title: null };
    const title = saveable.find(m => m.role === 'user')?.content?.slice(0, 60) || 'New Conversation';
    try {
      const res = convId
        ? await api.put(`/ai/conversations/${convId}`, { title, messages: saveable })
        : await api.post('/ai/conversations', { title, messages: saveable });
      return { id: res.data.id, title };
    } catch {
      return { id: convId, title };
    }
  }, []);

  async function deleteConversation(id) {
    try {
      await api.delete(`/ai/conversations/${id}`);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConvId === id) newChat();
      addToast('Conversation deleted', 'info');
    } catch {
      addToast('Could not delete conversation', 'error');
    }
  }

  async function renameConversation(id, title) {
    try {
      await api.patch(`/ai/conversations/${id}/rename`, { title });
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    } catch {
      addToast('Could not rename conversation', 'error');
    }
  }

  // ─── Image attachment ───
  function handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { addToast('Only image files are supported', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { addToast('Image must be under 5 MB', 'error'); return; }

    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      // Strip the data:image/xxx;base64, prefix to get raw base64
      const base64 = dataUrl.split(',')[1];
      setAttachedImage({ base64, mimeType: file.type, previewUrl: dataUrl, name: file.name });
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  // ─── Send message (streaming via SSE) ───
  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    const image = attachedImage;
    setInput('');
    setAttachedImage(null);

    // Append user message (with image preview if any)
    const userMsg = { role: 'user', content: userMessage, image: image?.previewUrl || null };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);
    setStreamingText('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await api.post('/ai/chat', {
        question: userMessage,
        ...(image ? { image_base64: image.base64, mime_type: image.mimeType } : {}),
      }, { signal: controller.signal });

      const data = res.data;
      const assistantMsg = {
        role: 'assistant',
        content: data?.response || 'AI service returned an empty response. Please try again.',
        // Prefer the array; fall back to wrapping the single field; last resort: export legacy
        file_requests: data?.file_requests
          || (data?.file_request ? [data.file_request] : null)
          || (data?.export ? [{ detected: true, file_type: data.export.type, filename: `medihub_export.${data.export.type}` }] : null),
        visualizations: data?.visualizations || [],
      };
      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      setStreamingText('');

      const { id: savedId, title: savedTitle } = await saveConversation(finalMessages, activeConvIdRef.current);
      if (savedId && savedId !== activeConvIdRef.current) {
        activeConvIdRef.current = savedId;
        setActiveConvId(savedId);
        setConversations(prev => {
          if (prev.some(c => c.id === savedId)) return prev;
          return [{ id: savedId, title: savedTitle, updated_at: new Date().toISOString() }, ...prev];
        });
      } else {
        setConversations(prev => prev.map(c =>
          c.id === savedId ? { ...c, updated_at: new Date().toISOString() } : c
        ));
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        // If we have partial streamed text, commit it as a stopped message
        if (streamingText) {
          setMessages(prev => [...prev, { role: 'assistant', content: streamingText + ' *(stopped)*', isError: false }]);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Request stopped.', isError: true }]);
        }
        setStreamingText('');
        return;
      }
      const errorMsg = err.message || 'Failed to get response. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg, isError: true }]);
      setStreamingText('');
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }

  function abortCurrentRequest() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    addToast('Request stopped', 'info');
  }

  // ─── Render ───
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
      style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}
    >
      {/* ── Conversation History Sidebar ── */}
      <div style={{
        width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)', padding: '14px 10px', gap: 8, overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <button
          className="btn btn-primary"
          onClick={newChat}
          style={{ borderRadius: 10, fontSize: 12, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
        >
          <IconPlus size={13} stroke={2} /> New Chat
        </button>

        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--steel)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 4px 4px' }}>
          Recent
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
              {[80, 60, 70].map((w, i) => <Skeleton key={i} width={w} height={12} />)}
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ color: 'var(--steel)', fontSize: 11, padding: '8px 4px' }}>No saved chats yet</div>
          ) : (
            conversations.map(conv => (
              <ConvItem
                key={conv.id}
                conv={conv}
                active={conv.id === activeConvId}
                onSelect={selectConversation}
                onDelete={deleteConversation}
                onRename={renameConversation}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Main Chat Panel ── */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>AI Assistant</h2>
            <p style={{ color: 'var(--steel)', margin: 0, fontSize: 12 }}>
              Ask anything · Attach images · Download reports
            </p>
          </div>
          <button className="btn btn-secondary" onClick={newChat} style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconRefresh size={13} /> New
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((msg, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
              style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                maxWidth: '85%',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: msg.role === 'user' ? 'var(--gradient-primary)' : 'var(--surface)',
                color: msg.role === 'user' ? '#fff' : 'var(--ink)',
                marginTop: 2,
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              }}>
                {msg.role === 'user' ? <IconUser size={16} /> : <IconRobot size={16} />}
              </div>

              {/* Bubble */}
              <div style={{
                padding: '10px 14px', borderRadius: 14,
                background: msg.role === 'user' ? 'var(--gradient-primary)' : msg.isError ? 'var(--bg-error)' : 'var(--surface)',
                color: msg.role === 'user' ? '#fff' : msg.isError ? 'var(--red)' : 'var(--ink)',
                fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'break-word',
                borderBottomLeftRadius: msg.role === 'assistant' ? 3 : 14,
                borderBottomRightRadius: msg.role === 'user' ? 3 : 14,
                maxWidth: 'calc(100% - 42px)',
                minWidth: 0,
                border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              }} className="markdown-message">
                {/* Attached image preview (user messages) */}
                {msg.image && (
                  <img
                    src={msg.image}
                    alt="attached"
                    style={{ display: 'block', maxWidth: 200, maxHeight: 150, borderRadius: 8, marginBottom: 8, objectFit: 'cover' }}
                  />
                )}

                {msg.role === 'assistant' ? (
                  <>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{msg.content}</ReactMarkdown>
                    {msg.visualizations?.map((visualization, i) => (
                      <ChatVisualization key={i} visualization={visualization} />
                    ))}
                    {msg.file_requests?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {msg.file_requests.map((fr, i) => (
                          <DownloadButton key={i} fileRequest={fr} messageContent={msg.content} />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </motion.div>
          ))}

          {/* Streaming response (in-progress) */}
          {loading && streamingText && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: '85%', alignSelf: 'flex-start' }}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', marginTop: 2, border: '1px solid var(--border)' }}>
                <IconRobot size={16} />
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 3, background: 'var(--surface)', fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: 'calc(100% - 42px)', minWidth: 0, border: '1px solid var(--border)' }} className="markdown-message">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{streamingText}</ReactMarkdown>
                <TypingCursor />
              </div>
            </motion.div>
          )}

          {/* Waiting skeleton (no tokens yet) */}
          {loading && !streamingText && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface)', marginTop: 2, border: '1px solid var(--border)' }}>
                <IconRobot size={16} />
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--surface)', marginTop: 2, border: '1px solid var(--border)' }}>
                <Skeleton width={120} height={14} />
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Starter prompts (fresh chat only) */}
        {messages.length === 1 && !loading && (
          <div style={{ padding: '0 20px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--steel)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Suggested
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {STARTER_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  style={{
                    padding: '6px 12px', borderRadius: 18, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--ink)', fontSize: 12, cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.target.style.background = 'var(--bg-subtle)'}
                  onMouseLeave={e => e.target.style.background = 'transparent'}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Image preview strip */}
        {attachedImage && (
          <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <img
                src={attachedImage.previewUrl}
                alt="attachment preview"
                style={{ height: 52, width: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
              />
              <button
                onClick={() => setAttachedImage(null)}
                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', background: 'var(--red)', border: 'none', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1 }}
              >×</button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--steel)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachedImage.name}</span>
          </div>
        )}

        {/* Input bar */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Attach image button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              title="Attach image"
              style={{
                flexShrink: 0, background: attachedImage ? 'var(--amber-tint)' : 'none',
                border: attachedImage ? '1px solid var(--amber)' : '1px solid var(--border)',
                color: attachedImage ? 'var(--amber)' : 'var(--steel)',
                padding: '9px 10px', borderRadius: 12, display: 'flex', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <IconPhoto size={16} stroke={1.8} />
            </button>

            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={loading ? 'AI is thinking…' : 'Ask anything about your pharmacy…'}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 22, border: '1px solid var(--border)',
                fontSize: 13, background: 'var(--bg-subtle)', outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--amber)'; e.target.style.boxShadow = '0 0 0 3px rgba(160,128,80,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />

            {loading ? (
              <button
                type="button"
                onClick={abortCurrentRequest}
                style={{ flexShrink: 0, borderRadius: 22, padding: '10px 18px', background: '#8b5a5a', color: '#fff', fontSize: 13, border: 'none', cursor: 'pointer' }}
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim() && !attachedImage}
                className="btn btn-primary"
                style={{ flexShrink: 0, borderRadius: 22, padding: '10px 18px' }}
              >
                <IconSend size={15} />
              </button>
            )}
          </form>
        </div>
      </div>
    </motion.div>
  );
}
