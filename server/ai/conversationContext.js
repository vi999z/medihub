/**
 * Conversation Context
 * Manages per-user conversation history and topic tracking.
 */

class ConversationContext {
  constructor(userId, maxTurns = 20) {
    this.userId = userId;
    this.maxTurns = maxTurns;
    this.history = [];
    this.metadata = {
      topics: [],
      preferredStyle: 'concise',
      lastQueryType: null,
      interactionCount: 0
    };
  }

  addMessage(role, content) {
    this.history.push({ role, content, timestamp: new Date() });
    this.metadata.interactionCount++;

    // Track topics from user messages
    if (role === 'user') {
      const topics = this.extractTopics(content);
      topics.forEach(topic => {
        if (!this.metadata.topics.includes(topic)) {
          this.metadata.topics.push(topic);
        }
      });
    }

    // Maintain conversation limit
    if (this.history.length > this.maxTurns * 2) {
      this.history.shift();
    }
  }

  extractTopics(text) {
    const keywords = {
      'inventory': ['inventory', 'stock', 'quantity', 'count'],
      'expiry': ['expir', 'shelf life', 'waste', 'expire'],
      'sales': ['sales', 'sold', 'revenue', 'transaction'],
      'orders': ['order', 'purchase', 'supplier', 'delivery'],
      'pricing': ['price', 'cost', 'profit', 'margin'],
      'analytics': ['trend', 'analytics', 'report', 'statistics'],
      'alerts': ['alert', 'warning', 'low stock', 'critical']
    };

    const topics = [];
    const lowerText = text.toLowerCase();

    for (const [topic, words] of Object.entries(keywords)) {
      if (words.some(word => lowerText.includes(word))) {
        topics.push(topic);
      }
    }

    return topics;
  }

  getHistory() {
    return this.history.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  getContext() {
    if (this.history.length === 0) return '';

    const recent = this.history.slice(-4);
    const context = recent.map(m => `${m.role}: ${m.content}`).join('\n');

    if (this.metadata.topics.length > 0) {
      return `${context}\n\nTopics discussed: ${this.metadata.topics.join(', ')}`;
    }

    return context;
  }

  summarize() {
    if (this.history.length < 2) return '';

    const topicSummary = this.metadata.topics.length > 0
      ? `User has been asking about ${this.metadata.topics.join(', ')}`
      : 'User has been asking about pharmacy inventory';

    return `Previous conversation context: ${topicSummary}. This is conversation turn ${this.metadata.interactionCount}.`;
  }

  setPreferredStyle(style) {
    this.metadata.preferredStyle = style;
  }

  getPreferredStyle() {
    return this.metadata.preferredStyle;
  }

  clear() {
    this.history = [];
    this.metadata.topics = [];
    this.metadata.interactionCount = 0;
  }
}

module.exports = { ConversationContext };
