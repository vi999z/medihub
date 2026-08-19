/**
 * Streaming Response Handler
 * Provides streaming capabilities for real-time AI responses (like ChatGPT)
 */

const { pool } = require('../config/db');
const { selectAvailableModel, MODEL_FALLBACK_CHAIN } = require('./medicalLLM');

/**
 * Stream a response using Server-Sent Events (SSE)
 * Allows real-time token-by-token response display
 */
async function streamGeminiResponse(question, systemPrompt, history, context, res, imageBase64 = null, mimeType = null) {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('API key not configured');
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Start the stream
    res.write('data: {"status":"started","message":"Connecting to AI service..."}\n\n');

    // Select best available model from fallback chain
    const selectedModel = await selectAvailableModel(apiKey);

    // Build contents from conversation history + current question
    const historyContents = (history || []).map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Ensure the current question is the last user message (with optional image)
    if (historyContents.length === 0 || historyContents[historyContents.length - 1].role !== 'user') {
      const userParts = [];
      if (imageBase64 && mimeType) {
        userParts.push({ inlineData: { mimeType, data: imageBase64 } });
      }
      userParts.push({ text: question });
      historyContents.push({ role: 'user', parts: userParts });
    }

    // Call Gemini API with streaming
    const { buildGeminiTools } = require('./geminiClient');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
            role: 'system'
          },
          contents: historyContents,
          tools: buildGeminiTools(),
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7,
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      res.write(`data: {"error":"${error}"}\n\n`);
      res.end();
      return;
    }

    // Process the streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        // Gemini streamGenerateContent returns a JSON array stream:
        // each chunk line may start with "[", ",", or "]" — strip those
        // so each element can be parsed as a standalone JSON object.
        const raw = lines[i].trim();
        if (!raw || raw === '[' || raw === ']') continue;
        const line = raw.startsWith(',') ? raw.slice(1).trim() : raw;
        if (!line) continue;
        try {
          const data = JSON.parse(line);
          if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const text = data.candidates[0].content.parts[0].text;
            fullText += text;
            tokenCount++;
            res.write(`data: ${JSON.stringify({ content: text, token: tokenCount })}\n\n`);
          }
        } catch (e) {
          // skip unparseable lines silently (partial chunks will be retried next iteration)
        }
      }

      buffer = lines[lines.length - 1];
    }

    // Persist the exchange to conversation context so follow-up turns are aware of it
    if (context && fullText) {
      context.addMessage('user', question);
      context.addMessage('assistant', fullText);
    }

    res.write(`data: ${JSON.stringify({ status: 'completed', tokenCount })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Streaming error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}

module.exports = { streamGeminiResponse };
