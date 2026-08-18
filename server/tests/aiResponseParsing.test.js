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

test('extractGeneratedText handles blocked responses with useful feedback', () => {
  const payload = {
    promptFeedback: {
      blockReason: 'SAFETY'
    }
  };

  assert.match(extractGeneratedText(payload), /blocked|safety|quick summary|inventory snapshot/i);
  assert.doesNotMatch(extractGeneratedText(payload), /unable to provide a detailed AI answer|Please rephrase the question or ask for a quick inventory summary/i);
});
