// tests/test-strip-markdown.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripMarkdownForTxt } from '../scripts/lib/strip-markdown.js';

test('removes bold markers **text**', () => {
  assert.equal(stripMarkdownForTxt('**negrito**'), 'negrito');
});

test('removes bold markers in sentence', () => {
  assert.equal(stripMarkdownForTxt('texto **em negrito** aqui'), 'texto em negrito aqui');
});

test('removes heading # prefix', () => {
  assert.equal(stripMarkdownForTxt('# Título'), 'Título');
});

test('removes heading ## prefix', () => {
  assert.equal(stripMarkdownForTxt('## Subtítulo'), 'Subtítulo');
});

test('replaces each | with two spaces', () => {
  assert.equal(stripMarkdownForTxt('| A | B |'), '  A   B  ');
});

test('removes hr --- lines', () => {
  const result = stripMarkdownForTxt('texto\n---\nmais');
  assert.ok(!result.includes('---'), 'should not contain ---');
});

test('preserves plain text unchanged', () => {
  assert.equal(stripMarkdownForTxt('texto normal sem markdown'), 'texto normal sem markdown');
});

test('normalizes 3+ newlines to 2', () => {
  const result = stripMarkdownForTxt('a\n\n\n\nb');
  assert.ok(!result.includes('\n\n\n'), 'should not have 3+ consecutive newlines');
});

test('handles empty string', () => {
  assert.equal(stripMarkdownForTxt(''), '');
});
