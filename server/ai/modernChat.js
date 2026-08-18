/**
 * Modern Chat
 * Core chat entry points: modernChat (Gemini API with function calling)
 * and chatWithFileGeneration (chat + downloadable file detection).
 */

const { buildSystemPrompt, buildGeminiTools, detectIntention, callFunction } = require('./geminiClient');
const { extractGeneratedText, buildFallbackInventoryResponse, detectFileRequest } = require('./responseBuilder');

async function modernChat(question, userId, context = null, imageBase64 = null, mimeType = null) {
  try {
    const intention = detectIntention(question);

    const contextStr = (context && context.getHistory().length > 0) ? context.getContext() : '';
    const baseSystemPrompt = buildSystemPrompt(contextStr, intention);

    // Build contents from history, then append the current user turn
    const historyMsgs = context ? context.getHistory() : [];
    const contents = historyMsgs.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const userParts = [];
    if (imageBase64 && mimeType) {
      userParts.push({ inlineData: { mimeType, data: imageBase64 } });
    }
    userParts.push({ text: question });
    contents.push({ role: 'user', parts: userParts });

    console.log(`[AI] Processing question with intention: ${intention}`);
    console.log(`[AI] Conversation history length: ${contents.length}`);

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('AI service not configured');
    }

    const tools = buildGeminiTools();

    const selectedModels = [
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
    ];

    let lastError = null;

    for (const modelName of [...new Set(selectedModels)]) {
      try {
        // ── First API call: let Gemini decide which tools (if any) to invoke ──
        const firstResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: baseSystemPrompt }], role: 'system' },
              contents,
              tools,
              generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
              safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
              ]
            })
          }
        );

        if (!firstResponse.ok) {
          const errorText = await firstResponse.text();
          lastError = new Error(`API error (${firstResponse.status}): ${errorText}`);
          continue;
        }

        const firstText = await firstResponse.text();
        let firstData;
        try { firstData = JSON.parse(firstText); } catch { lastError = new Error(`Model ${modelName} returned invalid JSON`); continue; }
        const candidate = firstData?.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        // ── Check if Gemini requested any function calls ──
        const functionCallParts = parts.filter(p => p.functionCall);
        if (functionCallParts.length > 0) {
          const functionResponseParts = await Promise.all(
            functionCallParts.map(async p => {
              const { name, args } = p.functionCall;
              console.log(`[AI] Gemini requested function: ${name}`, args);
              const result = await callFunction(name, args || {});
              return { functionResponse: { name, response: { result } } };
            })
          );

          // ── Second API call: feed function results back to Gemini ──
          const contentsWithFn = [
            ...contents,
            { role: 'model', parts },
            { role: 'function', parts: functionResponseParts }
          ];

          const secondResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: baseSystemPrompt }], role: 'system' },
                contents: contentsWithFn,
                tools,
                generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
                safetySettings: [
                  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
                ]
              })
            }
          );

          if (!secondResponse.ok) {
            const errorText = await secondResponse.text();
            lastError = new Error(`API error on function response (${secondResponse.status}): ${errorText}`);
            continue;
          }

          const secondText = await secondResponse.text();
          let secondData;
          try { secondData = JSON.parse(secondText); } catch { lastError = new Error(`Model ${modelName} returned invalid JSON on function response`); continue; }
          const finalText = extractGeneratedText(secondData);
          const finalResponse = finalText || await buildFallbackInventoryResponse(question);

          if (context) {
            context.addMessage('user', question);
            context.addMessage('assistant', finalResponse);
          }

          return { response: finalResponse, intention, model: modelName, timestamp: new Date().toISOString() };
        }

        // ── No function call — use the direct text response ──
        const aiResponse = extractGeneratedText(firstData);
        const finalResponse = aiResponse || await buildFallbackInventoryResponse(question);

        if (context) {
          context.addMessage('user', question);
          context.addMessage('assistant', finalResponse);
        }

        return { response: finalResponse, intention, model: modelName, timestamp: new Date().toISOString() };

      } catch (err) {
        console.warn(`[AI] Model ${modelName} failed:`, err.message);
        lastError = err;
      }
    }

    // All models failed — local fallback
    const recoveryResponse = await buildFallbackInventoryResponse(question);
    if (context) {
      context.addMessage('user', question);
      context.addMessage('assistant', recoveryResponse);
    }

    return { response: recoveryResponse, intention, model: 'local_fallback', timestamp: new Date().toISOString() };

  } catch (err) {
    console.error('[AI] Error in modernChat:', err.message);
    throw err;
  }
}

async function chatWithFileGeneration(question, userId, context = null, imageBase64 = null, mimeType = null) {
  const requestedFileType = detectFileRequest(question);

  const standardResponse = await modernChat(question, userId, context, imageBase64, mimeType);

  if (requestedFileType) {
    return {
      ...standardResponse,
      file_request: {
        detected: true,
        file_type: requestedFileType,
        hint: `I detected you want a ${requestedFileType.toUpperCase()} file. You can use the file generation endpoint with your current data to create a downloadable ${requestedFileType} file. Would you like me to help you generate that now?`,
        endpoint: `/api/ai/generate-file`,
        available_formats: ['csv', 'excel', 'pdf', 'json', 'txt']
      }
    };
  }

  return standardResponse;
}

module.exports = { modernChat, chatWithFileGeneration };
