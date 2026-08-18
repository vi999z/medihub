/**
 * medicalLLM — barrel re-export
 *
 * All logic has been split into focused modules:
 *   llmConfig.js          — model chain, system prompt, response templates
 *   inventoryQueries.js   — database query functions
 *   analysisHelpers.js    — report, strategy, forecast, efficiency logic
 *   conversationContext.js — ConversationContext class
 *   geminiClient.js       — function calling, tools, intention detection
 *   responseBuilder.js    — text extraction, fallback response building
 *   modernChat.js         — modernChat & chatWithFileGeneration
 *
 * This file preserves the original module.exports shape so all existing
 * consumers (aiControllerEnhanced, streamingHandler, modelExplainer, tests)
 * continue to work without modification.
 */

const { MODEL_FALLBACK_CHAIN } = require('./llmConfig');
const { ConversationContext } = require('./conversationContext');
const {
  AVAILABLE_FUNCTIONS,
  callFunction,
  buildSystemPrompt,
  buildGeminiTools,
  detectIntention,
  selectAvailableModel
} = require('./geminiClient');
const {
  extractGeneratedText,
  buildFallbackInventoryResponse
} = require('./responseBuilder');
const { generateReport, createStrategy, forecastDemand, analyzeEfficiency } = require('./analysisHelpers');
const { modernChat, chatWithFileGeneration } = require('./modernChat');
const { detectFileRequest } = require('./responseBuilder');

module.exports = {
  modernChat,
  ConversationContext,
  callFunction,
  AVAILABLE_FUNCTIONS,
  detectIntention,
  buildSystemPrompt,
  buildGeminiTools,
  selectAvailableModel,
  MODEL_FALLBACK_CHAIN,
  extractGeneratedText,
  buildFallbackInventoryResponse,
  generateReport,
  createStrategy,
  forecastDemand,
  analyzeEfficiency,
  detectFileRequest,
  chatWithFileGeneration
};
