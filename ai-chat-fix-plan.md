# Plan: Fix AI Chat Returning Hardcoded Fallback String

## Top-Level Overview

The AI chat always replies with a hardcoded string — "I can give you a quick inventory summary instead. Ask about stock levels, expiring items, or low-stock alerts." — regardless of what the user asked. This string originates in `extractGeneratedText()` in `server/ai/medicalLLM.js` and leaks through to users because `buildFallbackInventoryResponse` eventually calls Gemini again, which again returns no text parts, which again returns the same hardcoded string — an infinite degradation loop.

The fix is: `extractGeneratedText` should return `null` (not a hardcoded string) when Gemini returns candidates with no usable text. The calling code already has logic to handle a null/empty response and route to `buildFallbackInventoryResponse`.

---

## Sub-Task 1 — Fix `extractGeneratedText` to return null instead of hardcoded strings

**Intent**  
`extractGeneratedText` currently returns human-readable strings as sentinel values when Gemini produces no text content. This is the wrong layer for that — the function's job is to extract text from a Gemini response object, not to generate user-facing messages. When there is no text, it should return `null` so the caller can decide how to handle it.

**Expected Outcomes**  
- `extractGeneratedText` returns `null` when Gemini returns candidates with no text parts, or when the response is blocked.
- The caller in `modernChat` handles `null` from `extractGeneratedText` by calling `buildFallbackInventoryResponse` (it already does this via the `isRecoveryText` check — but with `null` the check becomes simpler: just `if (!aiResponse)`).
- The hardcoded strings "I can give you a quick inventory summary instead..." never reach the user directly.

**Todo List**  
1. In `server/ai/medicalLLM.js`, in `extractGeneratedText` (line 1041), change the two fallback `return` statements at lines 1055–1062 to return `null` instead of hardcoded strings.
2. In `modernChat` (line 1428–1430), update the `isRecoveryText` check to also handle `null`/empty: `const finalResponse = (!aiResponse || isRecoveryText) ? await buildFallbackInventoryResponse(question) : aiResponse;`
3. In the function-call path (line 1416–1417), apply the same null guard: `const finalResponse = finalText || await buildFallbackInventoryResponse(question);` — this is already correct, no change needed.

**Relevant Context**  
- `server/ai/medicalLLM.js` — `extractGeneratedText` at line 1041, call site at line 1428.
- The `isRecoveryText` regex at line 1429 can be removed or simplified once `null` is returned instead of strings.

**Status** — `[ ] pending`

---

## Sub-Task 2 — Harden `buildFallbackInventoryResponse` against DB failures

**Intent**  
`buildFallbackInventoryResponse` calls `getInventorySummary()` and other DB helpers. If these fail, it may return an empty or broken response. Add a try/catch so it always returns a meaningful, honest message when the database is unreachable — without looping back into Gemini.

**Expected Outcomes**  
- If DB calls in `buildFallbackInventoryResponse` fail, the user gets a clear "I'm having trouble connecting to your inventory right now" message — not a blank response or a recycled hardcoded string.
- No further Gemini calls are made inside `buildFallbackInventoryResponse` (it's a local fallback, it should not call AI).

**Todo List**  
1. In `server/ai/medicalLLM.js`, wrap the body of `buildFallbackInventoryResponse` (line 1065) in a try/catch.
2. In the catch block, return a simple honest message: `"I'm having trouble accessing your inventory data right now. Please try again in a moment."` — no Gemini calls, no loops.

**Relevant Context**  
- `server/ai/medicalLLM.js` — `buildFallbackInventoryResponse` at line 1065.

**Status** — `[ ] pending`
