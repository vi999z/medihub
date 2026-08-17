# MediHub Modern LLM System

A next-generation pharmaceutical AI assistant powered by modern language models (Gemini 2.0) with advanced capabilities like conversation context, function calling, explanations, and streaming responses.

## 🚀 Features

### 1. **Modern LLM Integration**
- Uses Gemini 2.0 Flash with system instructions (like ChatGPT/Claude)
- Context-aware reasoning tailored for pharmaceuticals
- Medical domain expertise built into prompts

### 2. **Conversation Memory & Context**
- Multi-turn conversations with full history
- User-specific conversation contexts (per-session)
- Automatic context summarization for efficiency
- Session management with clear/reset capabilities

### 3. **Function Calling (Tool Use)**
The AI can invoke these functions to query data:

```
- get_inventory_summary: Overall inventory metrics
- get_expiry_analysis: Detailed expiry risk analysis
- get_low_stock_items: Items below reorder level
- get_sales_trends: Sales data and patterns
- get_anomaly_analysis: Unusual transactions
- get_reorder_recommendations: AI-recommended orders
- get_supplier_performance: Supplier metrics
- get_batch_details: Specific batch information
```

### 4. **Streaming Responses**
- Real-time token-by-token response display
- Better UX for longer analyses
- Server-Sent Events (SSE) implementation

### 5. **AI Model Explanations (XAI)**
Provides human-readable explanations for:
- Anomaly detections
- Expiry risk predictions
- Reorder recommendations
- Pharmacy health reports

### 6. **Intention Detection**
Automatically detects question type:
- Expiry management
- Reorder/stock issues
- Anomaly investigation
- Trend analysis
- Supplier performance
- General inquiries

## 📋 API Endpoints

### Modern Chat (New)
```
POST /api/ai/chat
Body: { question: "What's expiring this week?", stream: false }
Response: { response, intention, model, conversation_turn }
```

### Streaming Chat
```
POST /api/ai/chat?stream=true
Returns: Server-Sent Events stream with real-time response
```

### Pharmacy Health Report
```
GET /api/health-report
Response: { summary_data, health_report, ai_generated }
```

### Enhanced Analytics with Explanations
```
GET /api/ai/expiry-risk?explain=true
GET /api/ai/anomalies?explain=true
GET /api/ai/reorder-suggestions?explain=true
```

### Conversation Management
```
POST /api/ai/conversation/clear   - Clear history
GET /api/ai/conversation/info    - Get metadata
```

## 🔧 Configuration

### Environment Variables
```bash
GOOGLE_AI_API_KEY=your_gemini_api_key
```

### Optional: Override Model
The system uses `gemini-2.0-flash` by default. To use a different model, modify `medicalLLM.js`:

```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/YOUR_MODEL:generateContent?key=${apiKey}`,
  ...
);
```

## 💡 Usage Examples

### JavaScript/Node.js
```javascript
// Regular chat
const res = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: "What medications are expiring in the next 30 days?",
    stream: false
  })
});
const data = await res.json();
console.log(data.response);

// Streaming chat
const streamRes = await fetch('/api/ai/chat?stream=true', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: "Analyze my inventory health",
    stream: true
  })
});

const reader = streamRes.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Process streaming data
}
```

### React
```jsx
// See AiChatModern.jsx for full implementation
import AiChatModern from './pages/AiChatModern';

export default function App() {
  return <AiChatModern />;
}
```

### With Conversation Context
```javascript
// The system automatically maintains per-user context
// First message
POST /api/ai/chat
{ question: "What's our inventory value?" }

// Follow-up uses conversation history automatically
POST /api/ai/chat
{ question: "Which category has the most?" }
// AI remembers the previous question about inventory

// Clear when needed
POST /api/ai/conversation/clear
```

## 🧠 How It Works

### System Architecture

```
User Question
    ↓
[Intention Detection] → Determines question type
    ↓
[Context Retrieval] → Loads conversation history
    ↓
[System Prompt Building] → Combines medical instructions + context
    ↓
[Gemini 2.0 API Call] → Modern LLM with function calling
    ↓
[Response Processing] → Parse and format
    ↓
[Context Update] → Save to conversation memory
    ↓
User Response
```

### Medical Reasoning Framework

The system uses these principles:

1. **Medical Accuracy**: Patient safety and compliance first
2. **Data-Driven**: Every claim backed by database evidence
3. **Clear Communication**: Explain complex pharmacy concepts simply
4. **Actionable**: Provide specific, implementable recommendations
5. **Transparency**: Acknowledge data limitations

### Response Structure

Responses follow a consistent structure:

1. **Direct Answer** - Address the question
2. **Data Evidence** - Show relevant data
3. **Pharmaceutical Context** - Explain why it matters
4. **Actionable Recommendation** - What to do
5. **Caveats** - Data limitations

## 🔄 Migration from Old System

### Old Way
```javascript
// AiChat.jsx - Basic chat without context
const res = await api.post('/ai/chat', { question });
```

### New Way
```javascript
// AiChatModern.jsx - Full features
const res = await api.post('/ai/chat', { 
  question,
  stream: true  // Optional: enable streaming
});
// Response includes: intention, model, conversation_turn
```

### Backward Compatibility
The old API endpoints still work:
- `GET /api/ai/expiry-risk` ✓
- `GET /api/ai/reorder-suggestions` ✓
- `GET /api/ai/anomalies` ✓
- `POST /api/ai/train` ✓

Add `?explain=true` to get LLM explanations.

## 📊 Example Responses

### Expiry Analysis
```
"Looking at your batches, you have 3 medications expiring 
within 30 days with a total risk value of 2,450 units at risk. 

The highest risk is Medication X (batch #2024-101) expiring in 
5 days with 150 units remaining. At current sales velocity of 
12 units/day, you'll consume only 60 units before expiry, 
wasting ~90 units ($450).

**Recommended action**: Initiate emergency dispensing or 
donation program for Medication X today to minimize waste."
```

### Anomaly Detection
```
"I detected an unusual transaction on 2024-08-15: 500 units 
of Pain Relief (Batch #2024-45) were removed by John Smith.

Why this is unusual: Normal removals average 8-12 units. 
This is 50x normal. Z-score: 4.2 (critical threshold).

Possible explanations: Inventory correction, donation program, 
or documentation error.

**Recommended action**: Verify with John Smith and check 
if the reason was documented correctly."
```

## ⚙️ Advanced Configuration

### Custom Conversation Context Window
```javascript
// In medicalLLM.js
class ConversationContext {
  constructor(userId, maxTurns = 5) { // Change 5 to your preference
    this.maxTurns = maxTurns;
  }
}
```

### Change Response Temperature
```javascript
// In medicalLLM.js, modernChat function
generationConfig: {
  temperature: 0.5  // Lower = more focused, Higher = more creative
}
```

### Custom Intentions
```javascript
// In medicalLLM.js, detectIntention function
const keywords = {
  your_intention: ['keyword1', 'keyword2', ...]
};
```

## 🐛 Troubleshooting

### "AI service not configured"
- Check `GOOGLE_AI_API_KEY` in `.env`
- Ensure you have a valid Gemini API key from Google AI Studio

### Streaming doesn't work
- Browser must support fetch API with streaming
- Check CORS headers (should be set by server)
- Ensure `stream: true` parameter is passed

### Slow responses
- This is normal for first response (cold start)
- Subsequent responses are faster with context caching
- Temperature 0.7 is optimal balance; 0.5 is faster

### Context too large
- System auto-manages conversation history
- Clear conversation if needed: `POST /api/ai/conversation/clear`
- Adjust `maxTurns` in `ConversationContext` for production

## 📈 Performance Tips

1. **Use Streaming for Long Responses**
   - Better perceived performance
   - Keeps UI responsive

2. **Batch Similar Questions**
   - Ask follow-ups in same conversation
   - Reuses context (faster)

3. **Add `explain=true` Selectively**
   - Adds ~200ms latency per request
   - Worth it for critical decisions

4. **Clear Old Conversations**
   - Post-session cleanup improves memory usage
   - Automatic cleanup after 5 turns anyway

## 🔐 Security

- All requests require authentication (`verifyToken` middleware)
- API key stored securely in `.env` (never in frontend)
- Audit logging for all AI interactions
- No personal data in AI context (unless needed)

## 📚 File Structure

```
server/
├── ai/
│   ├── medicalLLM.js          ← Core modern LLM system
│   ├── streamingHandler.js    ← Streaming responses
│   ├── modelExplainer.js      ← XAI explanations
│   ├── anomalyDetection.js    ← Existing (still used)
│   ├── expiryRiskModel.js     ← Existing (still used)
│   └── demandForecastModel.js ← Existing (still used)
├── controllers/
│   ├── aiControllerEnhanced.js ← New enhanced controller
│   └── aiController.js        ← Old controller (legacy)
└── routes/
    ├── aiRoutesEnhanced.js     ← New enhanced routes
    └── aiRoutes.js            ← Old routes (legacy)

client/
└── src/pages/
    ├── AiChatModern.jsx        ← New modern UI
    └── AiChat.jsx             ← Old UI (legacy)
```

## 🚀 Next Steps

1. **Test the new endpoints** in your API client
2. **Switch the UI** to use AiChatModern.jsx
3. **Monitor performance** using audit logs
4. **Gather user feedback** on AI quality
5. **Fine-tune prompts** based on use cases

## 📞 Support

For issues or questions:
1. Check `.env` configuration
2. Review server logs for API errors
3. Test with direct API calls first
4. Check audit logs for interaction history

## 🔗 Related Files

- `.env` - Configuration
- `database/schema.sql` - Database structure
- `server/utils/auditLogger.js` - Logging system
- `server/middleware/auth.js` - Authentication
