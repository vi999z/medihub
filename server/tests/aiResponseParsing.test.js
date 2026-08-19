const test = require('node:test');
const assert = require('node:assert/strict');

const { extractGeneratedText } = require('../ai/medicalLLM');

test('extractGeneratedText reads normal Google candidate text responses', () => {
  const payload = {
    candidates: [{
      content: {
        parts: [{ text: 'Inventory looks healthy.' }]
      }
    }]
  };

  assert.equal(extractGeneratedText(payload), 'Inventory looks healthy.');
});

test('extractGeneratedText returns null for blocked responses', () => {
  const payload = {
    promptFeedback: {
      blockReason: 'SAFETY'
    }
  };

  // Blocked responses return null so callers fall through to buildFallbackInventoryResponse
  assert.equal(extractGeneratedText(payload), null);
});

test('extractGeneratedText returns null when candidates have no text parts', () => {
  const payload = {
    candidates: [{
      content: {
        parts: [{ functionCall: { name: 'get_inventory_summary', args: {} } }]
      }
    }]
  };

  assert.equal(extractGeneratedText(payload), null);
});

test('extractGeneratedText returns null for empty response', () => {
  assert.equal(extractGeneratedText({}), null);
  assert.equal(extractGeneratedText(null), null);
});

test('empty AI payload is treated as no text content', () => {
  const payload = { candidates: [{ content: { parts: [{ text: '' }] } }] };
  assert.equal(extractGeneratedText(payload), null);
});
