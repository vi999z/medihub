# Quick Start Guide: Modern LLM Integration

## 🎯 5-Minute Setup

### Step 1: Verify Environment
```bash
# Check you have GOOGLE_AI_API_KEY set
echo $GOOGLE_AI_API_KEY  # Should show your API key
```

### Step 2: Restart Server
```bash
# Kill existing process
# Restart server
npm start
```

### Step 3: Test in Browser
Navigate to http://localhost:3000 and:
1. Login to your account
2. Go to "AI Assistant" page
3. Ask a question: "What's expiring this week?"

### Step 4: That's It! 🎉

## 📱 Frontend Integration Checklist

- [ ] Import `AiChatModern.jsx` in your router
- [ ] Update navigation to point to new AI chat page
- [ ] Test message sending and response
- [ ] Test streaming (should see text appear gradually)
- [ ] Test conversation context (ask follow-up questions)
- [ ] Test health report button
- [ ] Test clear conversation button

## 🔌 Backend Integration Checklist

- [ ] Server using `aiRoutesEnhanced` (check server.js)
- [ ] Environment variables set:
  - `GOOGLE_AI_API_KEY`
  - `DATABASE_URL` (already set)
  - `PORT` (already set)
- [ ] Weather recommendations work with **no extra config** — powered by Open-Meteo (free, no key)
- [ ] Database connection working
- [ ] Audit logging working

## 🧪 Quick Tests

### Test 1: Basic Chat
```bash
curl -X POST http://localhost:5000/api/ai/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is our inventory value?"}'
```

### Test 2: Streaming Chat
```bash
curl -X POST http://localhost:5000/api/ai/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "Analyze pharmacy health", "stream": true}'
```

### Test 3: Health Report
```bash
curl http://localhost:5000/api/health-report \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 4: With Explanations
```bash
curl http://localhost:5000/api/ai/expiry-risk?explain=true \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "AI service not configured" | Check `GOOGLE_AI_API_KEY` in `.env` |
| No response | Wait 30s (cold start), then retry |
| Timeout | Increase timeout to 30s in client |
| 401 Unauthorized | Ensure token is valid, re-login |
| 429 Rate Limited | Wait 60 seconds, implement backoff |

## 🚀 Next Steps

1. **Test thoroughly** - Try different questions
2. **Monitor performance** - Check logs for errors
3. **Gather feedback** - What users like/dislike
4. **Fine-tune prompts** - Based on actual usage
5. **Deploy to production** - When confident

## 📚 Documentation

- `MODERN_LLM_GUIDE.md` - Comprehensive guide
- `API_REFERENCE.md` - Full API documentation
- `examples.js` - Working code examples
- `medicalLLM.js` - Core implementation

## 💬 Key Features Summary

✓ **Multi-turn conversations** - Context awareness  
✓ **Streaming responses** - Real-time display  
✓ **AI explanations** - Understand the "why"  
✓ **Intention detection** - Knows what you're asking  
✓ **Pharmaceutical expertise** - Medical-focused AI  
✓ **Conversation history** - Per-user memory  
✓ **Health reports** - Executive summaries  

## 📞 Support

1. Check the documentation first
2. Look at error logs: `server logs`
3. Test with provided examples
4. Verify API key and database connection
5. Try clearing conversation history

## 🎓 Learning Path

1. **Beginner**: Use the frontend UI, ask simple questions
2. **Intermediate**: Test API endpoints with curl/Postman
3. **Advanced**: Integrate into your app, customize prompts
4. **Expert**: Fine-tune models, implement caching, optimize costs

---

**Questions?** Check `MODERN_LLM_GUIDE.md` for detailed information.
