/**
 * Streaming Response Handler
 * Provides streaming capabilities for real-time AI responses (like ChatGPT)
 */

const { pool } = require('../config/db');

/**
 * Stream a response using Server-Sent Events (SSE)
 * Allows real-time token-by-token response display
 */
async function streamGeminiResponse(question, systemPrompt, res) {
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

    // Call Gemini API with streaming
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }],
            role: 'system'
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: question }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 1200,
            temperature: 0.7,
            topP: 0.9,
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const data = JSON.parse(line);
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
              const text = data.candidates[0].content.parts[0].text;
              tokenCount++;
              res.write(`data: ${JSON.stringify({ content: text, token: tokenCount })}\n\n`);
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }

      buffer = lines[lines.length - 1];
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
