/**
 * Modern Chat
 * Core chat entry points using the @google/genai SDK.
 *
 * Model IDs and best practices sourced directly from:
 *   https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5
 *   https://ai.google.dev/gemini-api/docs/latest-model
 *
 * Key rules for Gemini 3.x (enforced here):
 *  - Do NOT set temperature / top_p / top_k — not recommended, defaults are optimised.
 *  - Use thinkingConfig { thinkingBudget } (or thinking_level) instead of thinking_budget.
 *  - Every FunctionResponse must include the `id` from the matching FunctionCall.
 *  - Default thinking effort is "medium" — use "low" for speed, "high" for hard tasks.
 */

const { GoogleGenAI, HarmCategory, HarmBlockThreshold } = require('@google/genai');
const { buildSystemPrompt, buildGeminiTools, detectIntention, callFunction } = require('./geminiClient');
const { extractGeneratedText, buildFallbackInventoryResponse, detectFileRequest, detectGeneratedContent } = require('./responseBuilder');

// ─── Model fallback chain (best → reliable) ───
// Current model names as listed in the official Gemini API docs.
const MODEL_CHAIN = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
];

// Safety settings — permissive enough for medical/pharmacy content
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// ─── Thinking level by intention ───
// Gemini 3.x: "medium" = default/best for most tasks, "low" = faster/cheaper,
// "high" = deep reasoning, "minimal" = fastest (near no thinking).
// Source: https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#default-effort-level
function getThinkingLevel(intention) {
  if (['analysis', 'forecasting', 'anomaly', 'performance'].includes(intention)) {
    return 'medium'; // complex multi-step — use full default reasoning
  }
  if (['expiry', 'reorder', 'trend', 'weather', 'pricing'].includes(intention)) {
    return 'low'; // data lookup + light reasoning — fast and cheap
  }
  return 'minimal'; // conversational / simple queries — fastest response
}

// For Gemini 3.x: only set maxOutputTokens + thinkingConfig.
// Do NOT include temperature/topP/topK — not recommended per Google docs.
// For older models (2.x, 1.5.x) which don't support thinkingConfig, use a plain config.
function buildConfig(modelName, intention, systemText, tools) {
  const is3x = modelName.startsWith('gemini-3');
  const base = {
    systemInstruction: systemText,
    tools,
    maxOutputTokens: 8192,
    safetySettings: SAFETY_SETTINGS,
  };
  if (is3x) {
    base.thinkingConfig = { thinkingBudget: thinkingLevelToBudget(getThinkingLevel(intention)) };
  } else {
    // Older models: safe to pass temperature
    base.temperature = 0.3;
    base.topP = 0.9;
  }
  return base;
}

// Map thinking level name → numeric budget (used by thinkingConfig.thinkingBudget)
// Values sourced from SDK defaults and Gemini docs context:
//   minimal ≈ 0, low ≈ 1024, medium ≈ 8192, high ≈ 24576
function thinkingLevelToBudget(level) {
  switch (level) {
    case 'minimal': return 0;
    case 'low':     return 1024;
    case 'medium':  return 8192;
    case 'high':    return 24576;
    default:        return 8192;
  }
}

async function modernChat(question, userId, context = null, imageBase64 = null, mimeType = null) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('AI service not configured');

  const intention  = detectIntention(question);
  const systemText = buildSystemPrompt('', intention);
  const tools      = buildGeminiTools();

  // Current turn only — server is stateless, client owns history
  const userParts = [];
  if (imageBase64 && mimeType) {
    userParts.push({ inlineData: { mimeType, data: imageBase64 } });
  }
  userParts.push({ text: question });
  const contents = [{ role: 'user', parts: userParts }];

  const thinkingLevel = getThinkingLevel(intention);
  console.log(`[AI] intention=${intention}  thinking=${thinkingLevel}  primary=${MODEL_CHAIN[0]}`);

  const ai = new GoogleGenAI({ apiKey });

  let lastError = null;

  for (const modelName of MODEL_CHAIN) {
    try {
      const config = buildConfig(modelName, intention, systemText, tools);

      // ── First call: let model decide if it needs tools ──
      const firstResult = await ai.models.generateContent({
        model: modelName,
        contents,
        config,
      });

      const candidate = firstResult.candidates?.[0];
      const parts     = candidate?.content?.parts || [];

      // ── Handle function calls (run in parallel for speed) ──
      const fnCallParts = parts.filter(p => p.functionCall);
      if (fnCallParts.length > 0) {
        const fnResponseParts = await Promise.all(
          fnCallParts.map(async p => {
            const { name, args, id } = p.functionCall;
            console.log(`[AI] fn: ${name}`, JSON.stringify(args || {}));
            const result = await callFunction(name, args || {});
            // Gemini 3.x requires id + name to match the originating FunctionCall
            const response = { name, response: { result } };
            if (id) response.id = id;
            return { functionResponse: response };
          })
        );

        // ── Second call: feed function results back ──
        const secondResult = await ai.models.generateContent({
          model: modelName,
          contents: [
            ...contents,
            { role: 'model',    parts },
            { role: 'function', parts: fnResponseParts },
          ],
          config,
        });

        const finalText = extractGeneratedText(secondResult) || await buildFallbackInventoryResponse(question);
        return { response: finalText, intention, model: modelName, timestamp: new Date().toISOString() };
      }

      // ── No function call — use direct text ──
      const aiText    = extractGeneratedText(firstResult);
      const finalText = aiText || await buildFallbackInventoryResponse(question);
      return { response: finalText, intention, model: modelName, timestamp: new Date().toISOString() };
    } catch (err) {
      console.warn(`[AI] ${modelName} failed: ${err.message}`);
      lastError = err;
    }
  }

  // All models failed — DB-driven local fallback
  console.error('[AI] All models in chain failed:', lastError?.message);
  const recoveryResponse = await buildFallbackInventoryResponse(question);
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
      file_requests: generatedFiles,
      file_request:  generatedFiles[0],
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
