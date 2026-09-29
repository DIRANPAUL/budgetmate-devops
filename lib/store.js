'use strict';

/**
 * store.js
 * -----------------------------------------------------------------------
 * Minimal in-memory data store standing in for BudgetMate's persistence
 * layer. In production this would be backed by a managed database (the
 * project's business plan specifies Postgres); an in-memory store keeps
 * this pipeline demo self-contained and dependency-free while still
 * exercising real request/response logic end-to-end.
 * -----------------------------------------------------------------------
 */

const { categorizeTransaction } = require('./budgetLogic');

const budgets = new Map([
  ['Groceries', 90],
  ['Transport', 40],
  ['Study', 60],
  ['Rent & Bills', 260],
  ['Entertainment', 35],
  ['Dining Out', 50],
]);

/** @type {Array<{id:number, description:string, amount:number, category:string, date:string}>} */
const transactions = [
  { description: 'Woolworths Burwood', amount: -42.15, date: '2026-09-22' },
  { description: 'Opal top up', amount: -25.0, date: '2026-09-22' },
  { description: 'Deakin Co-op Bookshop', amount: -58.4, date: '2026-09-23' },
  { description: 'Netflix Subscription', amount: -16.99, date: '2026-09-24' },
  { description: 'Cafe Nero Burwood', amount: -6.5, date: '2026-09-24' },
  { description: 'Woolworths Burwood', amount: -31.2, date: '2026-09-26' },
  { description: 'Origin Energy', amount: -74.3, date: '2026-09-26' },
  { description: 'Part-time job payment', amount: 310.0, date: '2026-09-20' },
].map((t, i) => ({ id: i + 1, category: categorizeTransaction(t.description), ...t }));

const goals = new Map([
  [1, { id: 1, name: 'Laptop for placement', currentAmount: 420, targetAmount: 1200, weeklyContribution: 65 }],
  [2, { id: 2, name: 'End-of-trimester trip', currentAmount: 90, targetAmount: 500, weeklyContribution: 20 }],
]);

let nextTransactionId = transactions.length + 1;

function listTransactions() {
  return transactions.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
}

function addTransaction({ description, amount, date }) {
  const category = categorizeTransaction(description);
  const record = { id: nextTransactionId++, description, amount, category, date };
  transactions.push(record);
  return record;
}

function getBudgetLimit(category) {
  return budgets.get(category);
}

function getGoal(id) {
  return goals.get(Number(id));
}

module.exports = {
  transactions,
  budgets,
  goals,
  listTransactions,
  addTransaction,
  getBudgetLimit,
  getGoal,
};
