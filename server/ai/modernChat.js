/**
 * Modern Chat
 * Core chat entry points using the @google/genai SDK.
 * Uses gemini-2.0-flash as the primary model with a fallback chain.
 */

const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const { buildSystemPrompt, buildGeminiTools, detectIntention, callFunction } = require('./geminiClient');
const { extractGeneratedText, buildFallbackInventoryResponse, detectFileRequest, detectGeneratedContent } = require('./responseBuilder');

// ─── Model fallback chain (newest → oldest) ───
const MODEL_CHAIN = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

// Safety settings that allow medical/inventory content
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

async function modernChat(question, userId, context = null, imageBase64 = null, mimeType = null) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('AI service not configured');

  const intention   = detectIntention(question);
  const contextStr  = (context && context.getHistory().length > 0) ? context.getContext() : '';
  const systemText  = buildSystemPrompt(contextStr, intention);
  const tools       = buildGeminiTools(); // [{ functionDeclarations: [...] }]

  // Build conversation contents from history
  const historyMsgs = context ? context.getHistory() : [];
  const contents = historyMsgs.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // Append current user turn (with optional image)
  const userParts = [];
  if (imageBase64 && mimeType) {
    userParts.push({ inlineData: { mimeType, data: imageBase64 } });
  }
  userParts.push({ text: question });
  contents.push({ role: 'user', parts: userParts });

  console.log(`[AI] intention=${intention}  history=${contents.length - 1} turns`);

  const ai = new GoogleGenAI({ apiKey });

  let lastError = null;

  for (const modelName of MODEL_CHAIN) {
    try {
      // ── First call: let model decide if it needs tools ──
      const firstResult = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemText,
          tools,
          maxOutputTokens: 8192,
          temperature: 0.7,
          safetySettings: SAFETY_SETTINGS,
        },
      });

      const candidate  = firstResult.candidates?.[0];
      const parts      = candidate?.content?.parts || [];

      // ── Handle function calls ──
      const fnCallParts = parts.filter(p => p.functionCall);
      if (fnCallParts.length > 0) {
        const fnResponseParts = await Promise.all(
          fnCallParts.map(async p => {
            const { name, args } = p.functionCall;
            console.log(`[AI] function call: ${name}`, args);
            const result = await callFunction(name, args || {});
            return { functionResponse: { name, response: { result } } };
          })
        );

        // ── Second call: feed function results back ──
        const contentsWithFn = [
          ...contents,
          { role: 'model',    parts },
          { role: 'function', parts: fnResponseParts },
        ];

        const secondResult = await ai.models.generateContent({
          model: modelName,
          contents: contentsWithFn,
          config: {
            systemInstruction: systemText,
            tools,
            maxOutputTokens: 8192,
            temperature: 0.7,
            safetySettings: SAFETY_SETTINGS,
          },
        });

        const finalText = extractGeneratedText(secondResult) || await buildFallbackInventoryResponse(question);

        if (context) {
          context.addMessage('user',      question);
          context.addMessage('assistant', finalText);
        }

        return { response: finalText, intention, model: modelName, timestamp: new Date().toISOString() };
      }

      // ── No function call — use direct text ──
      const aiText     = extractGeneratedText(firstResult);
      const finalText  = aiText || await buildFallbackInventoryResponse(question);

      if (context) {
        context.addMessage('user',      question);
        context.addMessage('assistant', finalText);
      }

      return { response: finalText, intention, model: modelName, timestamp: new Date().toISOString() };

    } catch (err) {
      console.warn(`[AI] ${modelName} failed: ${err.message}`);
      lastError = err;
    }
  }

  // All models failed — return a local DB-driven fallback
  console.error('[AI] All models in chain failed:', lastError?.message);
  const recoveryResponse = await buildFallbackInventoryResponse(question);
  if (context) {
    context.addMessage('user',      question);
    context.addMessage('assistant', recoveryResponse);
  }

  return { response: recoveryResponse, intention, model: 'local_fallback', timestamp: new Date().toISOString() };
}

async function chatWithFileGeneration(question, userId, context = null, imageBase64 = null, mimeType = null) {
  const requestedFileType = detectFileRequest(question);
  const standardResponse  = await modernChat(question, userId, context, imageBase64, mimeType);

  // 1. AI embedded one or more file blocks — surface all of them
  const generatedFiles = detectGeneratedContent(standardResponse.response, question);
  if (generatedFiles.length > 0) {
    return {
      ...standardResponse,
      file_requests: generatedFiles,           // array: one entry per fenced block
      file_request:  generatedFiles[0],        // backwards-compat single field
    };
  }

  // 2. Question asked for a file but AI didn't embed content — client will call /generate-file
  if (requestedFileType) {
    const { deriveFilename } = require('./responseBuilder');
    const fallback = { detected: true, file_type: requestedFileType, content: null, filename: deriveFilename(question, requestedFileType) };
    return {
      ...standardResponse,
      file_requests: [fallback],
      file_request:  fallback,
    };
  }

  return standardResponse;
}

module.exports = { modernChat, chatWithFileGeneration };
