'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  categorizeTransaction,
  calculateBudgetStatus,
  projectSavingsGoal,
} = require('../lib/budgetLogic');

test('categorizeTransaction: matches known merchant keywords', () => {
  assert.equal(categorizeTransaction('Woolworths Burwood'), 'Groceries');
  assert.equal(categorizeTransaction('OPAL TOP UP SYDNEY'), 'Transport');
  assert.equal(categorizeTransaction('Deakin Co-op Bookshop'), 'Study');
  assert.equal(categorizeTransaction('ORIGIN ENERGY DDR'), 'Rent & Bills');
  assert.equal(categorizeTransaction('NETFLIX.COM'), 'Entertainment');
  assert.equal(categorizeTransaction('Cafe Nero'), 'Dining Out');
});

test('categorizeTransaction: is case-insensitive', () => {
  assert.equal(categorizeTransaction('wOOLWORTHS bURWOOD'), 'Groceries');
});

test('categorizeTransaction: falls back to Uncategorised for unknown merchants', () => {
  assert.equal(categorizeTransaction('XYZ Mystery Merchant Pty Ltd'), 'Uncategorised');
});

test('categorizeTransaction: rejects empty or non-string input', () => {
  assert.throws(() => categorizeTransaction(''), TypeError);
  assert.throws(() => categorizeTransaction(null), TypeError);
  assert.throws(() => categorizeTransaction(42), TypeError);
});

test('calculateBudgetStatus: sums only matching-category spend, ignores income', () => {
  const txns = [
    { category: 'Groceries', amount: -40 },
    { category: 'Groceries', amount: -20 },
    { category: 'Groceries', amount: 100 }, // income row, should be ignored
    { category: 'Transport', amount: -15 }, // different category, should be ignored
  ];
  const result = calculateBudgetStatus(txns, 'Groceries', 90);
  assert.equal(result.spent, 60);
  assert.equal(result.remaining, 30);
  assert.equal(result.status, 'ok');
});

test('calculateBudgetStatus: flags warning at >= 80% of limit', () => {
  const txns = [{ category: 'Entertainment', amount: -29 }];
  const result = calculateBudgetStatus(txns, 'Entertainment', 35);
  assert.equal(result.percentUsed, 82.86);
  assert.equal(result.status, 'warning');
});

test('calculateBudgetStatus: flags over when spend exceeds limit', () => {
  const txns = [{ category: 'Dining Out', amount: -65 }];
  const result = calculateBudgetStatus(txns, 'Dining Out', 50);
  assert.equal(result.status, 'over');
  assert.equal(result.remaining, -15);
});

test('calculateBudgetStatus: rejects a non-positive limit', () => {
  assert.throws(() => calculateBudgetStatus([], 'Groceries', 0), RangeError);
  assert.throws(() => calculateBudgetStatus([], 'Groceries', -10), RangeError);
});

test('calculateBudgetStatus: rejects a non-array transactions argument', () => {
  assert.throws(() => calculateBudgetStatus('not-an-array', 'Groceries', 90), TypeError);
});

test('projectSavingsGoal: computes weeks remaining and completion date', () => {
  const from = new Date('2026-09-29T00:00:00.000Z');
  const result = projectSavingsGoal(420, 1200, 65, from);
  assert.equal(result.weeksRemaining, 12); // ceil(780 / 65) = 12
  assert.equal(result.projectedCompletionDate, '2026-12-22');
  assert.equal(result.onTrack, true);
});

test('projectSavingsGoal: goal already met returns zero weeks remaining', () => {
  const from = new Date('2026-09-29T00:00:00.000Z');
  const result = projectSavingsGoal(1200, 1200, 65, from);
  assert.equal(result.weeksRemaining, 0);
  assert.equal(result.onTrack, true);
});

test('projectSavingsGoal: zero weekly contribution with a shortfall is not on track', () => {
  const result = projectSavingsGoal(100, 500, 0);
  assert.equal(result.weeksRemaining, Infinity);
  assert.equal(result.projectedCompletionDate, null);
  assert.equal(result.onTrack, false);
});

test('projectSavingsGoal: rejects non-numeric input', () => {
  assert.throws(() => projectSavingsGoal('100', 500, 20), TypeError);
});

test('projectSavingsGoal: rejects a non-positive target amount', () => {
  assert.throws(() => projectSavingsGoal(0, 0, 20), RangeError);
});
