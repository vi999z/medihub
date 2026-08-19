# Plan: Split medicalLLM.js into Focused Modules

## Top-Level Overview

`server/ai/medicalLLM.js` is 1479 lines containing 6 distinct concerns crammed together.
The goal is to split it into focused, single-responsibility modules while keeping `medicalLLM.js` as a thin re-export barrel so existing consumers (`aiControllerEnhanced.js`, `streamingHandler.js`, `modelExplainer.js`, `aiResponseParsing.test.js`) require no changes.

No logic changes — pure structural reorganisation.

---

## Proposed Module Map

| New File | Lines (approx) | Contents |
|---|---|---|
| `server/ai/llmConfig.js` | ~20 | `MODEL_FALLBACK_CHAIN`, `MEDICAL_INSTRUCTIONS`, `RESPONSE_TEMPLATES` |
| `server/ai/inventoryQueries.js` | ~160 | `getInventorySummary`, `getExpiryAnalysis`, `getLowStockItems`, `getSalesTrends`, `getAnomalyAnalysis`, `getReorderRecommendations`, `getSupplierPerformance`, `getBatchDetails` |
| `server/ai/analysisHelpers.js` | ~430 | All pure helper functions: `generateReport`, `createStrategy`, `forecastDemand`, `analyzeEfficiency`, and all `calculate*`, `generate*`, `identify*`, `estimate*`, `analyze*` helpers |
| `server/ai/responseBuilder.js` | ~200 | `validateAndCleanMarkdown`, `extractGeneratedText`, `buildFallbackInventoryResponse`, `fetchRelevantData`, `buildContextualResponse`, `detectFileRequest` |
| `server/ai/conversationContext.js` | ~100 | `ConversationContext` class |
| `server/ai/geminiClient.js` | ~130 | `AVAILABLE_FUNCTIONS`, `callFunction`, `buildSystemPrompt`, `buildGeminiTools`, `detectIntention`, `selectAvailableModel` |
| `server/ai/medicalLLM.js` | ~40 | Barrel: re-exports everything from the above modules; keeps all existing `module.exports` intact |

---

## Sub-Task 1 — Create `llmConfig.js`

**Intent**  
Extract all constants (model list, system instructions, response templates) into a dedicated config file. These never change at runtime and have no dependencies — they belong first.

**Expected Outcomes**  
- `server/ai/llmConfig.js` exports `MODEL_FALLBACK_CHAIN`, `MEDICAL_INSTRUCTIONS`, `RESPONSE_TEMPLATES`.
- No other file is changed yet.

**Todo List**  
1. Create `server/ai/llmConfig.js` with the three constants (lines 13–114 of `medicalLLM.js`).
2. Add `module.exports = { MODEL_FALLBACK_CHAIN, MEDICAL_INSTRUCTIONS, RESPONSE_TEMPLATES }`.

**Relevant Context**  
- `medicalLLM.js` lines 13–114.

**Status** — `[ ] pending`

---

## Sub-Task 2 — Create `inventoryQueries.js`

**Intent**  
Extract all database query functions into one place. These are pure DB-layer functions that map to SQL views and tables. They have no AI logic — they only need `pool` from db config.

**Expected Outcomes**  
- `server/ai/inventoryQueries.js` exports the 8 query functions.
- These functions can be imported by other modules without pulling in AI logic.

**Todo List**  
1. Create `server/ai/inventoryQueries.js`.
2. Import `pool` from `../config/db` and the 3 AI model helpers (`scoreActiveBatches`, `getReorderSuggestions`, `detectAnomalies`).
3. Move functions: `getInventorySummary`, `getExpiryAnalysis`, `getLowStockItems`, `getSalesTrends`, `getAnomalyAnalysis`, `getReorderRecommendations`, `getSupplierPerformance`, `getBatchDetails` (lines 237–391).
4. Export all 8 functions.

**Relevant Context**  
- `medicalLLM.js` lines 237–391.
- Imports needed: `pool`, `scoreActiveBatches`, `getReorderSuggestions`, `detectAnomalies`.

**Status** — `[ ] pending`

---

## Sub-Task 3 — Create `analysisHelpers.js`

**Intent**  
Extract all pure analysis/report/strategy computation functions. These are stateless helpers that take data objects and return derived objects or strings. They have no Gemini API calls.

**Expected Outcomes**  
- `server/ai/analysisHelpers.js` exports `generateReport`, `createStrategy`, `forecastDemand`, `analyzeEfficiency`, and all the private helper functions they depend on.

**Todo List**  
1. Create `server/ai/analysisHelpers.js`.
2. Import `inventoryQueries.js` (the 8 query functions it uses).
3. Move functions from lines 393–849 (everything between `generateReport` and the `ConversationContext` class): `generateReport`, `generateInventoryAnalysis`, `generateExpiryAnalysis`, `generateSalesAnalysis`, `generateComprehensiveAnalysis`, `createStrategy`, `forecastDemand`, `analyzeEfficiency`, and all the `calculate*`, `generate*`, `identify*`, `estimate*`, `analyze*` helpers.
4. Export: `generateReport`, `createStrategy`, `forecastDemand`, `analyzeEfficiency`.

**Relevant Context**  
- `medicalLLM.js` lines 393–849.

**Status** — `[ ] pending`

---

## Sub-Task 4 — Create `conversationContext.js`

**Intent**  
The `ConversationContext` class is a self-contained stateful object with no external dependencies. It belongs in its own file.

**Expected Outcomes**  
- `server/ai/conversationContext.js` exports the `ConversationContext` class.

**Todo List**  
1. Create `server/ai/conversationContext.js`.
2. Move the `ConversationContext` class (lines 851–950).
3. Export it: `module.exports = { ConversationContext }`.

**Relevant Context**  
- `medicalLLM.js` lines 851–950.

**Status** — `[ ] pending`

---

## Sub-Task 5 — Create `geminiClient.js`

**Intent**  
Extract all Gemini API interface code: function calling definitions, the tool schema builder, the system prompt builder, the intention detector, and the model selector. This is the "Gemini protocol" layer.

**Expected Outcomes**  
- `server/ai/geminiClient.js` exports `AVAILABLE_FUNCTIONS`, `callFunction`, `buildSystemPrompt`, `buildGeminiTools`, `detectIntention`, `selectAvailableModel`.

**Todo List**  
1. Create `server/ai/geminiClient.js`.
2. Import `llmConfig.js` (for `MEDICAL_INSTRUCTIONS`) and `inventoryQueries.js` (for the functions `callFunction` dispatches to) and `analysisHelpers.js` (for `generateReport`, `createStrategy`, `forecastDemand`, `analyzeEfficiency`).
3. Move: `AVAILABLE_FUNCTIONS`, `callFunction`, `buildSystemPrompt`, `buildGeminiTools`, `detectIntention`, `selectAvailableModel` (lines 149–199 and 982–1038).
4. Export all 6.

**Relevant Context**  
- `medicalLLM.js` lines 149–199 (`AVAILABLE_FUNCTIONS`, `callFunction`) and 982–1038 (`buildSystemPrompt`, `buildGeminiTools`, `detectIntention`, `selectAvailableModel`).
- `streamingHandler.js` imports `selectAvailableModel` and `MODEL_FALLBACK_CHAIN` — these come from `geminiClient.js` and `llmConfig.js` respectively; the barrel re-export in `medicalLLM.js` covers this.
- `modelExplainer.js` imports `selectAvailableModel` — same, covered by barrel.

**Status** — `[ ] pending`

---

## Sub-Task 6 — Create `responseBuilder.js`

**Intent**  
Extract all response construction and fallback logic: markdown validation, Gemini text extraction, fallback response building, contextual response building, and file request detection.

**Expected Outcomes**  
- `server/ai/responseBuilder.js` exports `validateAndCleanMarkdown`, `extractGeneratedText`, `buildFallbackInventoryResponse`, `fetchRelevantData`, `buildContextualResponse`, `detectFileRequest`.

**Todo List**  
1. Create `server/ai/responseBuilder.js`.
2. Import `llmConfig.js` (for `RESPONSE_TEMPLATES`) and `inventoryQueries.js` (for query helpers used in `buildFallbackInventoryResponse` and `fetchRelevantData`).
3. Move functions: `validateAndCleanMarkdown`, `extractGeneratedText`, `buildFallbackInventoryResponse`, `fetchRelevantData`, `buildContextualResponse`, `detectFileRequest` (lines 117–145 and 1041–1261).
4. Export all 6.
5. **Also apply the bug fix** from the `ai-chat-fix-plan.md` here: in `extractGeneratedText`, return `null` instead of hardcoded strings for the empty-candidates branches.

**Relevant Context**  
- `medicalLLM.js` lines 117–145 and 1041–1261.
- `aiResponseParsing.test.js` imports `extractGeneratedText` — covered by barrel re-export.

**Status** — `[ ] pending`

---

## Sub-Task 7 — Create `modernChat.js` and update `medicalLLM.js` barrel

**Intent**  
Move the two main chat entry points (`modernChat`, `chatWithFileGeneration`) into their own file, then reduce `medicalLLM.js` to a pure re-export barrel. This is the final step — no consumer files need to be touched.

**Expected Outcomes**  
- `server/ai/modernChat.js` contains `modernChat` and `chatWithFileGeneration`.
- `server/ai/medicalLLM.js` is ~40 lines of re-exports that preserves the exact same `module.exports` shape that `aiControllerEnhanced.js`, `streamingHandler.js`, `modelExplainer.js`, and the test file all depend on.
- All existing imports continue to work without modification.

**Todo List**  
1. Create `server/ai/modernChat.js`.
2. Import all dependencies: `geminiClient.js`, `responseBuilder.js`, `conversationContext.js`, `inventoryQueries.js`.
3. Move `modernChat` and `chatWithFileGeneration` (lines 1264–1478) into this file.
4. Export both functions.
5. Rewrite `medicalLLM.js` as a barrel that re-exports from all 6 new modules, preserving the exact same exports as today.
6. Delete the original function bodies from `medicalLLM.js` (they are now in the barrel).

**Relevant Context**  
- `medicalLLM.js` lines 1264–1478 (`modernChat`, `chatWithFileGeneration`).
- `aiControllerEnhanced.js` line 7: imports `modernChat, ConversationContext, detectIntention, buildSystemPrompt, buildGeminiTools, callFunction, AVAILABLE_FUNCTIONS, generateReport, createStrategy, forecastDemand, analyzeEfficiency, chatWithFileGeneration` — all must remain available from `'../ai/medicalLLM'`.
- `streamingHandler.js` imports `selectAvailableModel, MODEL_FALLBACK_CHAIN`.
- `modelExplainer.js` imports `selectAvailableModel`.
- `aiResponseParsing.test.js` imports `extractGeneratedText`.

**Status** — `[ ] pending`
