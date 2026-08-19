# Gemini Capability Gap — Implementation Plan

## Overview

Close four concrete capability gaps between the current MediHub AI integration and what
Gemini natively supports. All changes are confined to the AI layer — no database schema
or auth changes required.

**Scope:**
1. Wire native function calling to the Gemini API (currently declared but never sent)
2. Fix streaming to carry conversation history (currently sends single-turn requests)
3. Expand conversation context window from 5 to 20 turns
4. Add multimodal image input so users can upload medicine packaging / invoices

---

## Sub-Task 1 — Native Gemini Function Calling

**Status:** [x] done

### Intent
`AVAILABLE_FUNCTIONS` is declared in `server/ai/medicalLLM.js` but the `tools:` key is
never included in the Gemini API request body. The app fakes function calling by using
keyword matching on the user's question to decide which data to pre-fetch, then injects
that data into the system prompt. Real Gemini function calling lets the model decide which
tools to invoke, supply their arguments, receive their outputs, and reason over them before
forming a final answer. This is the highest-impact gap.

### Expected Outcomes
- `modernChat()` sends a `tools` array to Gemini on every request
- When Gemini returns a `functionCall` part, the server executes `callFunction()` and
  sends back a `functionResponse` part in a second request
- The final response is drawn from actual Gemini reasoning over live data, not from
  keyword-matched pre-fetching
- Existing keyword-based pre-fetching in `fetchRelevantData()` can be removed or kept
  as a fallback — keep it for safety for now

### Todo List
1. In `modernChat()` (`server/ai/medicalLLM.js` line ~1324), add a `tools` key to the
   Gemini API request body, built from `AVAILABLE_FUNCTIONS` using the
   `functionDeclarations` schema Gemini expects.
2. After receiving the response, check if any candidate part has `functionCall` instead
   of `text`. If so, call `callFunction(name, args)` for each declared function call.
3. Append the original model turn and a `functionResponse` turn to `contents`, then make
   a second Gemini API call to get the final text answer.
4. Export nothing new — only the internal behaviour of `modernChat()` changes.
5. Update `buildSystemPrompt()` to remove the hard-coded `AVAILABLE FUNCTIONS` list from
   the prompt text (Gemini ignores it once real `tools` are declared).

### Relevant Context
- `AVAILABLE_FUNCTIONS` definition: `server/ai/medicalLLM.js` lines 149–198
- `callFunction()` dispatcher: `server/ai/medicalLLM.js` lines 201–235
- `modernChat()` API call: `server/ai/medicalLLM.js` lines 1311–1375
- `buildSystemPrompt()`: `server/ai/medicalLLM.js` lines 953–991
- Gemini function calling format: `tools: [{ functionDeclarations: [...] }]`,
  response part shape: `{ functionCall: { name, args } }`,
  follow-up content part: `{ role: "function", parts: [{ functionResponse: { name, response } }] }`

---

## Sub-Task 2 — Fix Streaming to Carry Conversation History

**Status:** [x] done

### Intent
`streamGeminiResponse()` in `server/ai/streamingHandler.js` sends only the current
question with no system instruction and no history. Every streamed reply is therefore
stateless — the model has no context of what was discussed earlier. The non-streaming
path works correctly because it goes through `modernChat()` which maintains context.
Streaming needs the same treatment.

### Expected Outcomes
- `streamGeminiResponse()` accepts the full conversation history and system prompt as
  parameters (it already accepts `systemPrompt` but ignores history)
- The Gemini streaming API call includes `contents` with the full history, not just the
  current question
- `chatModern()` in `aiControllerEnhanced.js` passes the user's context history into
  `streamGeminiResponse()`
- Streamed responses are added to the user's `ConversationContext` after completion

### Todo List
1. Change the signature of `streamGeminiResponse(question, systemPrompt, res)` to
   `streamGeminiResponse(question, systemPrompt, history, res)` where `history` is the
   array of `{role, content}` objects from `ConversationContext.getHistory()`.
2. Map `history` to Gemini `contents` format inside `streamGeminiResponse()`, replacing
   the current single-message `contents` array.
3. In `chatModern()` (`aiControllerEnhanced.js` line ~392), pass
   `context.getHistory()` as the third argument when calling `streamGeminiResponse()`.
4. After the stream completes (on `status: completed`), call
   `context.addMessage('user', question)` and `context.addMessage('assistant', fullText)`
   inside `streamGeminiResponse()` — this requires also passing `context` as a parameter,
   or handling it in `chatModern()` via a post-stream hook.
   Simplest approach: pass `context` as a fourth parameter to `streamGeminiResponse()`.
5. Update the single call-site in `aiControllerEnhanced.js` accordingly.

### Relevant Context
- `streamGeminiResponse()`: `server/ai/streamingHandler.js` lines 13–107
- `chatModern()` streaming branch: `server/controllers/aiControllerEnhanced.js` lines 392–399
- `ConversationContext.getHistory()`: `server/ai/medicalLLM.js` lines 907–912
- Role mapping: `assistant` → `model` for Gemini API

---

## Sub-Task 3 — Expand Conversation Context Window

**Status:** [x] done

### Intent
`ConversationContext` caps history at `maxTurns * 2` messages (default 5 turns = 10
messages). For a pharmacy manager asking a chain of follow-up questions, this means
context is lost after 5 exchanges. Gemini supports far more. Raising this to 20 turns
costs nothing extra and makes multi-step conversations significantly more useful.

### Expected Outcomes
- Default `maxTurns` raised from 5 to 20 in `ConversationContext` constructor
- The call-site in `getUserContext()` updated to match
- No other code changes required

### Todo List
1. In `ConversationContext` constructor (`medicalLLM.js` line ~852), change the default
   parameter from `maxTurns = 5` to `maxTurns = 20`.
2. In `getUserContext()` (`aiControllerEnhanced.js` line ~21), change
   `new ConversationContext(userId, 5)` to `new ConversationContext(userId, 20)`.
3. No frontend changes needed.

### Relevant Context
- `ConversationContext` constructor: `server/ai/medicalLLM.js` lines 851–862
- `getUserContext()`: `server/controllers/aiControllerEnhanced.js` lines 19–23

---

## Sub-Task 4 — Multimodal Image Input

**Status:** [x] done

### Intent
Gemini's vision model can analyse images. For a pharmacy this means a user can photograph
medicine packaging to get batch/expiry info extracted, upload a supplier invoice to parse
line items, or share a prescription for context. The current system is text-only.

This requires:
- Backend: a new endpoint that accepts a base64 image alongside an optional text prompt
  and sends both to Gemini as a multimodal `contents` part
- Frontend: an image attach button in the chat input, preview, and handling of the image
  response in the message list

### Expected Outcomes
- `POST /api/ai/chat/image` accepts `{ image_base64, mime_type, prompt }` and returns
  a Gemini vision analysis as a normal chat response
- Alternatively (simpler), the existing `POST /api/ai/chat` accepts an optional
  `image_base64` + `mime_type` field alongside `question` — no new route needed
- `AiChatModern.jsx` shows a paperclip/image icon in the input bar; clicking it opens a
  file picker limited to `image/*`; the selected image is shown as a thumbnail in the
  message and sent with the question
- Image data is never persisted to the database — it is sent directly to Gemini in the
  same request and discarded

### Todo List
1. **Backend — `medicalLLM.js`**: In `modernChat()`, if the caller supplies
   `imageBase64` and `mimeType`, add an `inlineData` part to the user message contents
   alongside the text part: `{ inlineData: { mimeType, data: imageBase64 } }`.
2. **Backend — `aiControllerEnhanced.js`**: In `chatModern()`, extract `image_base64`
   and `mime_type` from `req.body` and forward them into `chatWithFileGeneration()` /
   `modernChat()`.
3. **Backend — `aiRoutesEnhanced.js`**: Add `multer` or increase the body size limit to
   handle base64 payloads (a 2 MB image becomes ~2.7 MB base64). Use
   `express.json({ limit: '10mb' })` on this specific router, or configure it in
   `server.js`/`app.js` if body size is already globally limited.
4. **Frontend — `AiChatModern.jsx`**: Add a hidden `<input type="file" accept="image/*">`
   and a paperclip icon button that triggers it. On file selection, read the file with
   `FileReader.readAsDataURL()`, strip the `data:<mime>;base64,` prefix, store
   `{ base64, mimeType, previewUrl }` in a state variable `pendingImage`.
5. **Frontend — `AiChatModern.jsx`**: Show the image preview above the text input when
   `pendingImage` is set, with a remove button.
6. **Frontend — `AiChatModern.jsx`**: In `handleSubmit()`, if `pendingImage` is set,
   include `image_base64` and `mime_type` in the POST body, and show the image as a
   thumbnail in the user's chat bubble. Clear `pendingImage` after sending.
7. **Frontend — `AiChatModern.jsx`**: Update `handleStreamingResponse()` the same way —
   include the image fields in the `fetch` body if present. (Streaming with images uses
   the same multimodal format Gemini supports.)

### Relevant Context
- `modernChat()` message construction: `server/ai/medicalLLM.js` lines 1289–1348
- `chatModern()` in controller: `server/controllers/aiControllerEnhanced.js` lines 371–436
- `AiChatModern.jsx` submit handler: `client/src/pages/AiChatModern.jsx` lines 156–209
- `handleStreamingResponse()`: `client/src/pages/AiChatModern.jsx` lines 242–345
- Gemini multimodal format: `parts: [{ text: "..." }, { inlineData: { mimeType: "image/jpeg", data: "<base64>" } }]`
- Body size: check `server/server.js` or `server/app.js` for the global `express.json` limit

---

## Implementation Order

```
Sub-Task 3 (context window)  →  Sub-Task 2 (streaming history)  →  Sub-Task 1 (function calling)  →  Sub-Task 4 (image input)
```

Start with Sub-Task 3 because it is trivial and Sub-Task 2 depends on a healthy context
object. Sub-Task 1 is the most complex and should be done after 2 and 3 are verified.
Sub-Task 4 is independent and can be done last.
