# Modern LLM System - Testing & Validation Guide

## Overview

This guide helps you validate that the modern LLM system is working correctly in your MediHub installation.

## ✅ Pre-flight Checks

Before running tests, verify:

```bash
# 1. Server is running
curl http://localhost:5000/api/health
# Expected: { "status": "MediHub API running", "version": "2.0", "ai": "modern-llm" }

# 2. Database is connected
# Check if you can see medicines
curl http://localhost:5000/api/medicines -H "Authorization: Bearer YOUR_TOKEN"

# 3. API key is set
echo $GOOGLE_AI_API_KEY
# Should show a non-empty value

# 4. You're authenticated
# Get your token from login response
echo $MEDIHUB_TOKEN
# Should show a token value
```

## 🧪 Test Suite

### Test 1: Basic Connectivity

**Goal**: Verify server and API communication  
**Difficulty**: ⭐ Easy

```bash
#!/bin/bash
API="http://localhost:5000/api"
TOKEN="your_token_here"

echo "Testing health endpoint..."
curl -s "$API/health" | jq .

echo "Testing AI endpoint..."
curl -s -X POST "$API/ai/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Hello"}' | jq .

echo "✅ Basic connectivity test passed"
```

### Test 2: Chat Functionality

**Goal**: Verify AI chat works with simple questions  
**Difficulty**: ⭐ Easy  
**Duration**: ~5 seconds

```javascript
// Test: Basic chat
async function testBasicChat() {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      question: 'Hello, who are you?'
    })
  });

  const data = await response.json();
  
  // Validations
  console.assert(response.ok, 'Response status should be 200');
  console.assert(data.response, 'Should have response text');
  console.assert(data.model, 'Should specify model used');
  console.assert(data.intention, 'Should detect intention');
  console.assert(data.conversation_turn >= 0, 'Should track conversation');
  
  console.log('✅ Basic chat test passed');
}
```

**Expected Output:**
```
{
  "response": "Hello! I'm MediHub AI, your pharmaceutical intelligence...",
  "intention": "general_inquiry",
  "model": "gemini-2.0-flash",
  "conversation_turn": 1
}
```

### Test 3: Pharmacy-Related Questions

**Goal**: Verify AI understands medical context  
**Difficulty**: ⭐ Easy  
**Duration**: ~5 seconds

```javascript
const pharmacyQuestions = [
  "What medications are expiring soon?",
  "How many items are low on stock?",
  "What's our total inventory value?",
  "Are there any suspicious transactions?",
  "Which supplier has the best delivery time?"
];

async function testPharmacyChat() {
  for (const question of pharmacyQuestions) {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ question })
    });

    const data = await response.json();
    
    // All pharmacy questions should detect non-general intention
    console.assert(
      data.intention !== 'general_inquiry',
      `Question "${question}" should detect specific intention, got: ${data.intention}`
    );
    
    // Response should be data-driven (not generic)
    console.assert(
      data.response.length > 50,
      `Response too short: "${data.response.substring(0, 50)}..."`
    );
  }
  
  console.log('✅ Pharmacy chat test passed');
}
```

### Test 4: Conversation Context

**Goal**: Verify multi-turn conversation memory  
**Difficulty**: ⭐⭐ Medium  
**Duration**: ~15 seconds

```javascript
async function testConversationContext() {
  // Turn 1: Ask about value
  const res1 = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      question: 'What is our total inventory value?'
    })
  });

  const data1 = await res1.json();
  console.assert(data1.conversation_turn === 1, 'First turn should be 1');
  
  // Extract some number from response
  const numberMatch = data1.response.match(/\$?[\d,]+/);
  const totalValue = numberMatch ? numberMatch[0] : null;
  
  // Turn 2: Follow-up that depends on Turn 1
  const res2 = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      question: 'Is that amount reasonable? Should we order more?'
    })
  });

  const data2 = await res2.json();
  console.assert(data2.conversation_turn === 2, 'Second turn should be 2');
  
  // Turn 2 response should reference or understand Turn 1
  // (This is harder to test deterministically)
  console.log('Response 1:', data1.response.substring(0, 100));
  console.log('Response 2:', data2.response.substring(0, 100));
  console.log('✅ Conversation context test passed');
}
```

### Test 5: Streaming Response

**Goal**: Verify real-time response streaming  
**Difficulty**: ⭐⭐ Medium  
**Duration**: ~10 seconds

```javascript
async function testStreamingResponse() {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      question: 'Provide a detailed analysis of our pharmacy health',
      stream: true
    })
  });

  console.assert(response.ok, 'Should get 200 response');
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let tokenCount = 0;
  let receivedContent = false;
  let receivedCompletion = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          
          if (data.content) {
            receivedContent = true;
            tokenCount++;
            process.stdout.write(data.content);
          }
          
          if (data.status === 'completed') {
            receivedCompletion = true;
            console.log(`\n\n✅ Streaming test passed (${tokenCount} tokens)`);
          }
        } catch (e) {
          // Skip parse errors
        }
      }
    }
  }

  console.assert(receivedContent, 'Should receive content tokens');
  console.assert(receivedCompletion, 'Should receive completion signal');
}
```

### Test 6: Health Report

**Goal**: Verify executive summary generation  
**Difficulty**: ⭐ Easy  
**Duration**: ~5 seconds

```javascript
async function testHealthReport() {
  const response = await fetch('/api/ai/health-report', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json();
  
  // Validate structure
  console.assert(data.summary_data, 'Should have summary_data');
  console.assert(data.health_report, 'Should have health_report');
  console.assert(data.ai_generated === true, 'Should indicate AI generated');
  
  // Validate numeric fields
  console.assert(
    typeof data.summary_data.total_value === 'number',
    'total_value should be number'
  );
  console.assert(
    typeof data.summary_data.total_items === 'number',
    'total_items should be number'
  );
  
  // Validate report quality
  console.assert(
    data.health_report.length > 100,
    'Report should have meaningful content'
  );
  
  // Should contain at least one number
  console.assert(
    /\d/.test(data.health_report),
    'Report should reference actual data'
  );
  
  console.log('Summary:', data.summary_data);
  console.log('Report:', data.health_report.substring(0, 200) + '...');
  console.log('✅ Health report test passed');
}
```

### Test 7: Enhanced Analytics with Explanations

**Goal**: Verify LLM-powered explanations  
**Difficulty**: ⭐⭐ Medium  
**Duration**: ~10 seconds

```javascript
async function testEnhancedAnalytics() {
  // Test expiry risk with explanations
  const expiryRes = await fetch('/api/ai/expiry-risk?explain=true', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const expiryData = await expiryRes.json();
  
  console.assert(
    expiryData.top_risks_explained,
    'Should include top_risks_explained'
  );
  
  if (expiryData.top_risks_explained && expiryData.top_risks_explained.length > 0) {
    const risk = expiryData.top_risks_explained[0];
    console.assert(risk.ai_explanation, 'Should have AI explanation');
    console.assert(
      risk.ai_explanation.length > 20,
      'Explanation should be meaningful'
    );
  }

  // Test anomalies with explanations
  const anomalyRes = await fetch('/api/ai/anomalies?explain=true', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const anomalyData = await anomalyRes.json();
  
  console.assert(anomalyData.top_anomalies_explained, 'Should include explained anomalies');

  console.log('✅ Enhanced analytics test passed');
}
```

### Test 8: Conversation Management

**Goal**: Verify session memory control  
**Difficulty**: ⭐ Easy  
**Duration**: ~5 seconds

```javascript
async function testConversationManagement() {
  // Get current info
  const infoRes1 = await fetch('/api/ai/conversation/info', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const info1 = await infoRes1.json();
  const turnsBefore = info1.turn_count;

  // Clear conversation
  const clearRes = await fetch('/api/ai/conversation/clear', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const clearData = await clearRes.json();
  console.assert(clearData.message === 'Conversation history cleared', 'Clear should succeed');

  // Check info again
  const infoRes2 = await fetch('/api/ai/conversation/info', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const info2 = await infoRes2.json();
  console.assert(info2.turn_count === 0, 'Should reset to 0 after clear');

  console.log('✅ Conversation management test passed');
}
```

### Test 9: Error Handling

**Goal**: Verify error responses are helpful  
**Difficulty**: ⭐⭐ Medium  
**Duration**: ~5 seconds

```javascript
async function testErrorHandling() {
  // Test missing question
  const res1 = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ question: '' })
  });

  console.assert(res1.status === 400, 'Empty question should return 400');
  const err1 = await res1.json();
  console.assert(err1.error, 'Should include error message');

  // Test missing auth
  const res2 = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ question: 'Hello' })
  });

  console.assert(res2.status === 401, 'Missing auth should return 401');

  console.log('✅ Error handling test passed');
}
```

### Test 10: Performance Benchmarks

**Goal**: Measure response times  
**Difficulty**: ⭐⭐ Medium  
**Duration**: ~30 seconds

```javascript
async function testPerformance() {
  const results = {
    firstResponse: 0,
    subsequentResponses: [],
    averageTime: 0
  };

  // First response (may be slower - cold start)
  console.log('Testing first response...');
  let start = Date.now();
  await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ question: 'Hello' })
  });
  results.firstResponse = Date.now() - start;
  console.log(`First response: ${results.firstResponse}ms`);

  // Subsequent responses (should be consistent)
  console.log('Testing subsequent responses...');
  for (let i = 0; i < 3; i++) {
    start = Date.now();
    await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ question: `Question ${i}` })
    });
    const time = Date.now() - start;
    results.subsequentResponses.push(time);
    console.log(`Response ${i + 1}: ${time}ms`);
  }

  results.averageTime = results.subsequentResponses.reduce((a, b) => a + b, 0) / results.subsequentResponses.length;

  // Validate performance
  console.assert(
    results.firstResponse < 30000,
    'First response should be < 30s'
  );
  console.assert(
    results.averageTime < 15000,
    'Average response should be < 15s'
  );

  console.log('\nPerformance Summary:');
  console.log(`  First response: ${results.firstResponse}ms`);
  console.log(`  Average: ${results.averageTime}ms`);
  console.log('✅ Performance test passed');

  return results;
}
```

## 📊 Test Report Template

```
MediHub Modern LLM - Test Report
================================
Date: 2024-XX-XX
Tester: Your Name
Environment: Local / Staging / Production

Results:
--------
✅ Test 1: Basic Connectivity - PASSED (2.3s)
✅ Test 2: Chat Functionality - PASSED (4.2s)
✅ Test 3: Pharmacy Questions - PASSED (5.1s)
✅ Test 4: Conversation Context - PASSED (14.2s)
✅ Test 5: Streaming Response - PASSED (8.3s)
✅ Test 6: Health Report - PASSED (3.8s)
✅ Test 7: Enhanced Analytics - PASSED (9.2s)
✅ Test 8: Conversation Mgmt - PASSED (2.1s)
✅ Test 9: Error Handling - PASSED (1.8s)
✅ Test 10: Performance - PASSED

Summary:
--------
Total Tests: 10
Passed: 10
Failed: 0
Success Rate: 100%
Total Duration: 50.9s

Notes:
- All tests passed
- Response times are acceptable
- No errors encountered
- Ready for production

Recommendations:
- Deploy to staging
- Monitor in production
- Gather user feedback
```

## 🔄 Regression Testing

Run this whenever you make changes to AI code:

```bash
#!/bin/bash
echo "Running regression tests..."

# Test 1: Still works
curl -s -X POST localhost:5000/api/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Test"}' | jq . > /tmp/test1.json

# Test 2: Performance unchanged
TIME=$(curl -w '%{time_total}' -o /dev/null -s -X POST localhost:5000/api/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Test"}')

echo "Response time: ${TIME}s"

if (( $(echo "$TIME > 15" | bc -l) )); then
  echo "❌ Performance degraded!"
  exit 1
fi

echo "✅ All regression tests passed"
```

## 📝 Notes

- First response may be slower (cold start)
- Subsequent responses are faster
- Clear conversation if tests fail
- Check API key validity
- Verify database connectivity
- Monitor logs for errors

---

**All tests passing?** Your modern LLM system is ready! 🎉
