import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  IconSend, IconRobot, IconUser, IconRefresh, IconPlus,
  IconTrash, IconDownload, IconPencil, IconCheck, IconX,
  IconMessage,
} from '@tabler/icons-react';
import ReactMarkdown from 'react-markdown';
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

// ─── Markdown renderer config (shared) ───
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

// ─── Download button shown below an assistant message when AI detected a file request ───
function DownloadButton({ fileRequest, messageContent }) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const res = await api.post('/ai/generate-file', {
        file_type: fileRequest.file_type,
        content: { title: 'AI Report', rows: [], summary: {}, data: messageContent },
        filename: `medihub_${fileRequest.file_type}_export`
      });

      const { content, content_type, filename } = res.data;
      const blob = new Blob(
        [typeof content === 'string' ? content : JSON.stringify(content, null, 2)],
        { type: content_type || 'text/plain' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `medihub_export.${fileRequest.file_type}`;
      a.click();
      URL.revokeObjectURL(url);
      addToast(`Downloaded ${a.download}`, 'success');
    } catch (err) {
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
        marginTop: 10,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '7px 14px',
        borderRadius: 20,
        border: '1px solid var(--amber)',
        background: 'var(--amber-tint)',
        color: 'var(--amber)',
        fontSize: 12,
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.7 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <IconDownload size={13} stroke={2} />
      {busy ? 'Preparing…' : `Download ${fileRequest.file_type.toUpperCase()}`}
    </button>
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
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 10,
        cursor: 'pointer',
        background: active ? 'var(--amber-tint)' : 'transparent',
        border: active ? '1px solid var(--amber)' : '1px solid transparent',
        transition: 'all 0.15s',
        marginBottom: 2,
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
  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Conversation history state
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null); // null = unsaved new chat
  const [convLoading, setConvLoading] = useState(true);

  // ─── Scroll to bottom on new messages ───
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Load conversation list on mount ───
  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    try {
      const res = await api.get('/ai/conversations');
      setConversations(res.data.conversations || []);
    } catch {
      // non-fatal — sidebar will just be empty
    } finally {
      setConvLoading(false);
    }
  }

  // ─── Select a saved conversation ───
  async function selectConversation(id) {
    if (id === activeConvId) return;
    try {
      const res = await api.get(`/ai/conversations/${id}`);
      setMessages(res.data.messages?.length ? res.data.messages : BLANK_MESSAGES);
      setActiveConvId(id);
    } catch {
      addToast('Could not load conversation', 'error');
    }
  }

  // ─── Start a new chat ───
  function newChat() {
    setMessages(BLANK_MESSAGES);
    setActiveConvId(null);
    setInput('');
  }

  // ─── Auto-save after every assistant reply ───
  const saveConversation = useCallback(async (msgs, convId) => {
    if (msgs.length <= 1) return convId; // don't save the blank opening message alone
    const title = msgs.find(m => m.role === 'user')?.content?.slice(0, 60) || 'New Conversation';
    try {
      const res = convId
        ? await api.put(`/ai/conversations/${convId}`, { title, messages: msgs })
        : await api.post('/ai/conversations', { title, messages: msgs });
      return res.data.id;
    } catch {
      return convId;
    }
  }, []);

  // ─── Delete a conversation ───
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

  // ─── Rename a conversation ───
  async function renameConversation(id, title) {
    try {
      await api.patch(`/ai/conversations/${id}/rename`, { title });
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    } catch {
      addToast('Could not rename conversation', 'error');
    }
  }

  // ─── Send a message ───
  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    const nextMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(nextMessages);
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await api.post('/ai/chat', { question: userMessage }, { signal: controller.signal });
      const assistantMsg = {
        role: 'assistant',
        content: res.data.response,
        file_request: res.data.file_request || null,
      };
      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);

      // Auto-save and update sidebar
      const savedId = await saveConversation(finalMessages, activeConvId);
      if (savedId && savedId !== activeConvId) {
        setActiveConvId(savedId);
        // Refresh sidebar list
        loadConversations();
      } else {
        // Update updated_at in local list
        setConversations(prev => prev.map(c =>
          c.id === savedId ? { ...c, updated_at: new Date().toISOString() } : c
        ));
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Request stopped.', isError: true }]);
        return;
      }
      const errorMsg = err.response?.data?.error || err.message || 'Failed to get response. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg, isError: true }]);
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
      style={{ display: 'flex', gap: 16, height: 'calc(100vh - 120px)', minHeight: 520 }}
    >
      {/* ── Conversation History Sidebar ── */}
      <div style={{
        width: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding: '14px 10px',
        gap: 8,
        overflow: 'hidden',
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
            <p style={{ color: 'var(--steel)', margin: 0, fontSize: 12 }}>Ask about inventory, expiry, stock levels, and sales</p>
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
                display: 'flex',
                gap: 10,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                maxWidth: '82%',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: msg.role === 'user' ? 'var(--gradient-primary)' : 'var(--bg-subtle)',
                color: msg.role === 'user' ? '#fff' : 'var(--ink)',
              }}>
                {msg.role === 'user' ? <IconUser size={16} /> : <IconRobot size={16} />}
              </div>

              {/* Bubble */}
              <div style={{
                padding: '10px 14px',
                borderRadius: 14,
                background: msg.role === 'user' ? 'var(--gradient-primary)' : 'var(--bg-subtle)',
                color: msg.role === 'user' ? '#fff' : 'var(--ink)',
                fontSize: 13,
                lineHeight: 1.55,
                wordBreak: 'break-word',
                borderBottomLeftRadius: msg.role === 'assistant' ? 3 : 14,
                borderBottomRightRadius: msg.role === 'user' ? 3 : 14,
                maxWidth: '100%',
              }} className="markdown-message">
                {msg.role === 'assistant' ? (
                  <>
                    <ReactMarkdown components={MD_COMPONENTS}>{msg.content}</ReactMarkdown>
                    {msg.file_request?.detected && (
                      <DownloadButton fileRequest={msg.file_request} messageContent={msg.content} />
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </motion.div>
          ))}

          {/* Loading skeleton */}
          {loading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-subtle)' }}>
                <IconRobot size={16} />
              </div>
              <div style={{ padding: '10px 14px', borderRadius: 14, background: 'var(--bg-subtle)' }}>
                <Skeleton width={120} height={14} />
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Starter prompts (only on fresh chat) */}
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

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={loading ? 'AI is thinking…' : 'Ask about inventory, expiry, stock levels…'}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 22, border: '1px solid var(--border)',
                fontSize: 13, background: 'var(--bg-subtle)', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--amber)'; e.target.style.boxShadow = '0 0 0 3px rgba(160,128,80,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />
            {loading ? (
              <button type="button" onClick={abortCurrentRequest}
                className="btn btn-danger"
                style={{ borderRadius: 22, padding: '10px 18px', background: '#8b5a5a', color: '#fff', fontSize: 13 }}>
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="btn btn-primary"
                style={{ borderRadius: 22, padding: '10px 18px' }}>
                <IconSend size={15} />
              </button>
            )}
          </form>
        </div>
      </div>
    </motion.div>
  );
}
