/**
 * API Reference: Modern LLM Endpoints
 * Complete documentation of all new and enhanced endpoints
 */

// ═══════════════════════════════════════════════════════════════════════════
// CHAT & CONVERSATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ai/chat
 * Modern chat with conversation history and streaming support
 * 
 * Request:
 * {
 *   question: string,                    // Required: User's question
 *   stream: boolean                      // Optional: Enable streaming (default: false)
 * }
 * 
 * Response (non-streaming):
 * {
 *   response: string,                    // AI response text
 *   intention: string,                   // Detected question type (expiry, reorder, etc)
 *   model: string,                       // Model used (gemini-2.0-flash)
 *   timestamp: ISO8601,                  // When response was generated
 *   conversation_turn: number            // Current conversation turn
 * }
 * 
 * Response (streaming): Server-Sent Events
 * data: {"content": "response text", "token": 1}
 * data: {"content": " continues here", "token": 2}
 * data: {"status": "completed", "tokenCount": 45}
 * 
 * Example:
 * POST /api/ai/chat
 * Content-Type: application/json
 * Authorization: Bearer {token}
 * 
 * {
 *   "question": "What medications are critically low on stock?",
 *   "stream": false
 * }
 * 
 * HTTP/1.1 200 OK
 * {
 *   "response": "I found 3 medications critically low...",
 *   "intention": "reorder",
 *   "model": "gemini-2.0-flash",
 *   "conversation_turn": 1
 * }
 */

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS ENDPOINTS (Enhanced)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ai/expiry-risk?explain=true
 * Get expiry risk analysis with optional AI explanations
 * 
 * Query Parameters:
 * explain: "true"  - Include LLM explanations (adds ~200ms)
 * 
 * Response:
 * {
 *   results: [
 *     {
 *       batch_id: number,
 *       medicine_name: string,
 *       days_until_expiry: number,
 *       risk_score: 0-100,
 *       ai_explanation: "string (if explain=true)"
 *     }
 *   ],
 *   top_risks_explained: [ ... ],      // Only if explain=true
 *   explanation_source: "gemini-2.0-flash"
 * }
 * 
 * Example:
 * GET /api/ai/expiry-risk?explain=true
 * Authorization: Bearer {token}
 */

/**
 * GET /api/ai/anomalies?explain=true&days=30&severity=critical
 * Get anomaly detection results with explanations
 * 
 * Query Parameters:
 * explain: "true"    - Include LLM explanations
 * days: number       - Lookback period (default: 30)
 * severity: string   - Filter by: critical, warning, info
 * 
 * Response:
 * {
 *   total_anomalies: number,
 *   by_severity: {
 *     critical: number,
 *     warning: number,
 *     info: number
 *   },
 *   anomalies: [
 *     {
 *       transaction_id: number,
 *       medicine_name: string,
 *       quantity: number,
 *       z_score: number,
 *       severity: string,
 *       ai_explanation: "string (if explain=true)"
 *     }
 *   ],
 *   top_anomalies_explained: [ ... ]   // Only if explain=true
 * }
 */

/**
 * GET /api/ai/reorder-suggestions?explain=true
 * Get reorder recommendations with explanations
 * 
 * Query Parameters:
 * explain: "true"  - Include AI rationale for each recommendation
 * 
 * Response:
 * {
 *   suggestions: [
 *     {
 *       medicine_name: string,
 *       current_quantity: number,
 *       suggested_quantity: number,
 *       daily_velocity: number,
 *       ai_explanation: "string (if explain=true)"
 *     }
 *   ],
 *   top_recommendations_explained: [ ... ]
 * }
 */

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH & STATUS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ai/health-report
 * Generate comprehensive pharmacy health report
 * 
 * Response:
 * {
 *   summary_data: {
 *     total_value: number,        // Total inventory value
 *     total_items: number,        // Number of items
 *     expiring_count: number,     // Items expiring soon
 *     low_stock_count: number,    // Low stock items
 *     critical_anomalies: number  // Suspicious transactions
 *   },
 *   health_report: string,        // AI-generated executive summary
 *   timestamp: ISO8601,
 *   ai_generated: true
 * }
 * 
 * Example Response:
 * {
 *   "summary_data": {
 *     "total_value": 125000,
 *     "critical_anomalies": 2
 *   },
 *   "health_report": "Your pharmacy shows good overall inventory 
 *     health with $125K in stock. However, 3 medications expire 
 *     within 7 days... Priority: Address expiring stock today.",
 *   "ai_generated": true
 * }
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/ai/conversation/clear
 * Clear conversation history for current user
 * 
 * Response:
 * {
 *   message: "Conversation history cleared",
 *   userId: number
 * }
 * 
 * Use Case: Start fresh conversation, free memory
 */

/**
 * GET /api/ai/conversation/info
 * Get conversation metadata for current user
 * 
 * Response:
 * {
 *   user_id: number,
 *   turn_count: number,           // Number of conversation turns
 *   last_updated: ISO8601         // Last message timestamp
 * }
 * 
 * Use Case: UI displays conversation status
 */

// ═══════════════════════════════════════════════════════════════════════════
// BACKWARD COMPATIBLE ENDPOINTS (Still Available)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/ai/expiry-risk
 * Legacy endpoint (no conversations, no explanations)
 * Now maps to enhanced version without explain parameter
 */

/**
 * GET /api/ai/reorder-suggestions
 * Legacy endpoint for reorder suggestions
 * Now maps to enhanced version
 */

/**
 * GET /api/ai/anomalies
 * Legacy endpoint for anomaly detection
 * Now maps to enhanced version without explanations
 */

/**
 * POST /api/ai/train
 * Legacy endpoint for model training
 * Still works as before (admin only)
 */

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED USAGE PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Multi-turn Conversation Example
 * 
 * Turn 1: Ask about inventory
 * POST /api/ai/chat
 * {
 *   "question": "What's our total inventory value?"
 * }
 * 
 * Response:
 * {
 *   "response": "Your total inventory value is $125,430...",
 *   "conversation_turn": 1
 * }
 * 
 * Turn 2: Follow-up question (AI remembers Turn 1 context)
 * POST /api/ai/chat
 * {
 *   "question": "Which category contributes the most to this value?"
 * }
 * 
 * Response:
 * {
 *   "response": "Based on your inventory of $125,430, 
 *     Antibiotics make up 45% ($56,443)...",
 *   "conversation_turn": 2
 * }
 * 
 * The AI automatically maintained context from Turn 1!
 */

/**
 * Streaming Response Example (JavaScript)
 * 
 * const response = await fetch('/api/ai/chat', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'Authorization': `Bearer ${token}`
 *   },
 *   body: JSON.stringify({
 *     question: 'Analyze my pharmacy health',
 *     stream: true
 *   })
 * });
 * 
 * const reader = response.body.getReader();
 * const decoder = new TextDecoder();
 * 
 * while (true) {
 *   const { done, value } = await reader.read();
 *   if (done) break;
 *   
 *   const chunk = decoder.decode(value);
 *   const lines = chunk.split('\n');
 *   
 *   for (const line of lines) {
 *     if (line.startsWith('data: ')) {
 *       const data = JSON.parse(line.slice(6));
 *       console.log(data.content);  // Print as it arrives
 *     }
 *   }
 * }
 */

/**
 * Error Handling
 * 
 * Common Error Responses:
 * 
 * 400 Bad Request
 * { "error": "Question is required" }
 * 
 * 401 Unauthorized
 * { "error": "Invalid or missing authentication token" }
 * 
 * 429 Too Many Requests
 * { "error": "Rate limit exceeded. Please try again later." }
 * 
 * 500 Internal Server Error
 * { "error": "AI service not configured" }
 * 
 * Best Practices:
 * - Always check response.ok before parsing
 * - Implement exponential backoff for 429 errors
 * - Log error details for debugging
 * - Provide user-friendly error messages
 */

/**
 * Rate Limiting & Quotas
 * 
 * Google Gemini API has rate limits:
 * - Free tier: 60 requests per minute
 * - Paid tier: 1000+ requests per minute
 * 
 * Optimization strategies:
 * 1. Batch questions in one request
 * 2. Use streaming for long responses
 * 3. Cache results for common questions
 * 4. Implement request queuing
 */

/**
 * Cost Optimization
 * 
 * Gemini pricing (as of 2024):
 * - Input: $0.075 per 1M tokens
 * - Output: $0.30 per 1M tokens
 * 
 * Tips to reduce costs:
 * 1. Use gemini-2.0-flash (cheaper than pro)
 * 2. Set appropriate maxOutputTokens (default: 1000)
 * 3. Don't use explain=true unless needed
 * 4. Implement query caching
 * 5. Batch API calls when possible
 * 
 * Example cost calculation:
 * - Average question: 100 tokens input
 * - Average response: 300 tokens output
 * - Cost per chat: ($0.075 * 100 + $0.30 * 300) / 1M = ~0.0001$
 * - 1000 chats per day = ~$0.10/day
 */

// ═══════════════════════════════════════════════════════════════════════════
// AVAILABLE FUNCTIONS (For AI Function Calling)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The AI has access to these functions it can call automatically:
 * 
 * 1. get_inventory_summary()
 *    Returns: total_value, total_items, categories
 * 
 * 2. get_expiry_analysis(days_window=30)
 *    Returns: expiring_batches, risk_analysis
 * 
 * 3. get_low_stock_items(limit=10)
 *    Returns: items below reorder level
 * 
 * 4. get_sales_trends(days=30)
 *    Returns: daily trends, transactions, velocity
 * 
 * 5. get_anomaly_analysis(severity=null)
 *    Returns: anomalies by severity
 * 
 * 6. get_reorder_recommendations(include_rationale=true)
 *    Returns: suggested orders with reasoning
 * 
 * 7. get_supplier_performance(supplier_id=null)
 *    Returns: delivery time, order success rate
 * 
 * 8. get_batch_details(medicine_id)
 *    Returns: all batches for a medicine with metrics
 * 
 * The AI mentions when it's calling these functions in its response.
 */

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSE QUALITY METRICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * How to evaluate AI response quality:
 * 
 * ✓ Good Response Indicators:
 * - Specific numbers and data points
 * - Clear, actionable recommendations
 * - Acknowledges data limitations
 * - Related to user's question
 * - Professional pharmaceutical language
 * 
 * ✗ Poor Response Indicators:
 * - Generic/vague answers
 * - Contradicts database data
 * - Hallucinated numbers
 * - Off-topic content
 * - Grammatical errors
 * 
 * If response quality is poor:
 * 1. Check API key validity
 * 2. Verify database connectivity
 * 3. Check system prompt in medicalLLM.js
 * 4. Try with lower temperature (0.5 instead of 0.7)
 * 5. Clear conversation history and retry
 */
