#!/usr/bin/env node
/**
 * MediHub Modern LLM - Example Usage Scripts
 * Practical examples for testing and integrating the new API
 * 
 * Usage:
 * node examples.js --test chat
 * node examples.js --test streaming
 * node examples.js --test health
 * node examples.js --test conversation
 */

const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE = process.env.API_URL || 'http://localhost:5000/api';
const AUTH_TOKEN = process.env.MEDIHUB_TOKEN || 'your_token_here';

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 1: Basic Chat
// ═══════════════════════════════════════════════════════════════════════════

async function exampleBasicChat() {
  console.log('\n📝 Example 1: Basic Chat\n');
  console.log('Question: "What is the total value of our current inventory?"');
  console.log('---');

  try {
    const response = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        question: 'What is the total value of our current inventory?'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    console.log('\nResponse:');
    console.log(`Model: ${data.model}`);
    console.log(`Intention: ${data.intention}`);
    console.log(`Turn: ${data.conversation_turn}`);
    console.log(`\nAI Response:\n${data.response}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 2: Multi-turn Conversation
// ═══════════════════════════════════════════════════════════════════════════

async function exampleMultiTurnConversation() {
  console.log('\n🔄 Example 2: Multi-turn Conversation\n');

  const questions = [
    'What is our total inventory value?',
    'Which category has the highest value?',
    'What percentage does that represent?'
  ];

  try {
    for (let i = 0; i < questions.length; i++) {
      console.log(`\nTurn ${i + 1}: "${questions[i]}"`);
      console.log('---');

      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify({
          question: questions[i]
        })
      });

      const data = await response.json();
      console.log(`Response (Turn ${data.conversation_turn}):`);
      console.log(data.response.substring(0, 200) + '...\n');
    }

    console.log('\n✅ Conversation maintained context across turns!');
    console.log('Notice how Turn 3 remembers Turn 1 and 2 without explicit mention.');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 3: Streaming Response
// ═══════════════════════════════════════════════════════════════════════════

async function exampleStreamingResponse() {
  console.log('\n📡 Example 3: Streaming Response (Real-time)\n');
  console.log('Question: "Analyze my pharmacy inventory health"');
  console.log('---');
  console.log('Response (streaming in real-time):\n');

  try {
    const response = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        question: 'Analyze my pharmacy inventory health',
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.content) {
              process.stdout.write(data.content);
              tokenCount++;
            }
            
            if (data.status === 'completed') {
              console.log(`\n\n✅ Streaming complete! (${tokenCount} tokens)`);
            }
          } catch (e) {
            // Skip parse errors
          }
        }
      }

      buffer = lines[lines.length - 1];
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 4: Health Report
// ═══════════════════════════════════════════════════════════════════════════

async function exampleHealthReport() {
  console.log('\n🏥 Example 4: Pharmacy Health Report\n');

  try {
    const response = await fetch(`${API_BASE}/ai/health-report`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    console.log('Summary Data:');
    console.log(`  Total Value: $${data.summary_data.total_value.toLocaleString()}`);
    console.log(`  Total Items: ${data.summary_data.total_items}`);
    console.log(`  Expiring Soon: ${data.summary_data.expiring_count}`);
    console.log(`  Low Stock: ${data.summary_data.low_stock_count}`);
    console.log(`  Critical Anomalies: ${data.summary_data.critical_anomalies}`);

    console.log('\nHealth Report (AI Generated):');
    console.log(`\n${data.health_report}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 5: Enhanced Analytics with Explanations
// ═══════════════════════════════════════════════════════════════════════════

async function exampleEnhancedAnalytics() {
  console.log('\n💡 Example 5: Enhanced Analytics with AI Explanations\n');

  try {
    // Get expiry risk with explanations
    console.log('Fetching expiry risk with explanations...');
    const expiryResponse = await fetch(`${API_BASE}/ai/expiry-risk?explain=true`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const expiryData = await expiryResponse.json();

    if (expiryData.top_risks_explained && expiryData.top_risks_explained.length > 0) {
      console.log('\nTop Risk Items (with AI explanations):');
      expiryData.top_risks_explained.forEach((risk, idx) => {
        console.log(`\n${idx + 1}. ${risk.medicine_name} (${risk.batch_number})`);
        console.log(`   Risk Score: ${risk.risk_score}/100`);
        console.log(`   Days to Expiry: ${risk.days_until_expiry}`);
        console.log(`   AI Explanation: ${risk.ai_explanation}`);
      });
    }

    // Get anomalies with explanations
    console.log('\n\nFetching anomalies with explanations...');
    const anomalyResponse = await fetch(`${API_BASE}/ai/anomalies?explain=true&severity=critical`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const anomalyData = await anomalyResponse.json();

    if (anomalyData.top_anomalies_explained && anomalyData.top_anomalies_explained.length > 0) {
      console.log('\nCritical Anomalies (with AI explanations):');
      anomalyData.top_anomalies_explained.forEach((anomaly, idx) => {
        console.log(`\n${idx + 1}. ${anomaly.medicine_name} - ${anomaly.transaction_type}`);
        console.log(`   Quantity: ${anomaly.quantity} units`);
        console.log(`   Z-Score: ${anomaly.z_score}`);
        console.log(`   AI Explanation: ${anomaly.ai_explanation}`);
      });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 6: Conversation Management
// ═══════════════════════════════════════════════════════════════════════════

async function exampleConversationManagement() {
  console.log('\n💬 Example 6: Conversation Management\n');

  try {
    // Get conversation info
    console.log('Getting conversation info...');
    const infoResponse = await fetch(`${API_BASE}/ai/conversation/info`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const info = await infoResponse.json();
    console.log(`Current Turn: ${info.turn_count}`);
    console.log(`Last Updated: ${info.last_updated}`);

    // Clear conversation
    console.log('\nClearing conversation history...');
    const clearResponse = await fetch(`${API_BASE}/ai/conversation/clear`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const clearData = await clearResponse.json();
    console.log(`✅ ${clearData.message}`);

    // Check info again
    console.log('\nGetting conversation info after clear...');
    const infoResponse2 = await fetch(`${API_BASE}/ai/conversation/info`, {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      }
    });

    const info2 = await infoResponse2.json();
    console.log(`Current Turn: ${info2.turn_count}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE 7: Error Handling & Retry Logic
// ═══════════════════════════════════════════════════════════════════════════

async function exampleErrorHandling() {
  console.log('\n⚠️ Example 7: Error Handling & Retry Logic\n');

  const askWithRetry = async (question, maxRetries = 3) => {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries}...`);
        
        const response = await fetch(`${API_BASE}/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AUTH_TOKEN}`
          },
          body: JSON.stringify({ question })
        });

        if (response.status === 429) {
          // Rate limited - exponential backoff
          const delayMs = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Rate limited. Waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`✅ Success!\n${data.response.substring(0, 200)}...`);
        return data;

      } catch (err) {
        lastError = err;
        console.error(`❌ Error: ${err.message}`);
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          console.log(`⏳ Waiting ${delay}ms before retry...\n`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`\n❌ Failed after ${maxRetries} attempts: ${lastError?.message}`);
  };

  await askWithRetry('What are the top 3 priority actions for my pharmacy?');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN RUNNER
// ═══════════════════════════════════════════════════════════════════════════

const examples = {
  chat: exampleBasicChat,
  multi: exampleMultiTurnConversation,
  streaming: exampleStreamingResponse,
  health: exampleHealthReport,
  enhanced: exampleEnhancedAnalytics,
  conversation: exampleConversationManagement,
  errors: exampleErrorHandling,
  all: async () => {
    await exampleBasicChat();
    await exampleHealthReport();
    await exampleEnhancedAnalytics();
  }
};

async function main() {
  const example = process.argv[2] || 'chat';

  if (!examples[example]) {
    console.log('\n📖 Available Examples:');
    Object.keys(examples).forEach(name => {
      console.log(`  node examples.js ${name}`);
    });
    process.exit(1);
  }

  console.log(`\n🚀 Running: ${example}\n`);
  console.log(`API URL: ${API_BASE}`);
  console.log('---');

  try {
    await examples[example]();
    console.log('\n✅ Example completed!');
  } catch (err) {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  }
}

main();
