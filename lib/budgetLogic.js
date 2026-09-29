'use strict';

/**
 * budgetLogic.js
 * -----------------------------------------------------------------------
 * Pure, dependency-free business logic for BudgetMate's budgeting engine.
 * Kept free of I/O so it can be unit tested in isolation (see test/budgetLogic.test.js)
 * and re-used identically by the HTTP layer (server.js) and any future client.
 * -----------------------------------------------------------------------
 */

/**
 * Categorisation rule set. Each rule is checked, in order, against the
 * lower-cased transaction description. The first match wins, mirroring how
 * BudgetMate auto-categorises real bank-feed transactions pulled in via the
 * Consumer Data Right (CDR) open banking connection described in the
 * project's earlier business-plan and prototype deliverables.
 */
const CATEGORY_RULES = [
  { category: 'Groceries', keywords: ['woolworths', 'coles', 'aldi', 'iga', 'supermarket'] },
  { category: 'Transport', keywords: ['opal', 'myki', 'uber', 'metro', 'transport', 'fuel', 'bp ', 'caltex'] },
  { category: 'Study', keywords: ['deakin', 'textbook', 'co-op bookshop', 'library', 'stationery'] },
  { category: 'Rent & Bills', keywords: ['rent', 'electricity', 'origin energy', 'telstra', 'optus', 'internet'] },
  { category: 'Entertainment', keywords: ['netflix', 'spotify', 'cinema', 'hoyts', 'steam', 'bar', 'pub'] },
  { category: 'Dining Out', keywords: ['cafe', 'coffee', 'mcdonald', 'kfc', 'restaurant', 'ubereats', 'menulog'] },
];

const DEFAULT_CATEGORY = 'Uncategorised';

/**
 * Auto-categorise a single bank transaction description.
 * @param {string} description Raw merchant/description string from a bank feed.
 * @returns {string} The matched category, or DEFAULT_CATEGORY if nothing matched.
 */
function categorizeTransaction(description) {
  if (typeof description !== 'string' || description.trim() === '') {
    throw new TypeError('categorizeTransaction: description must be a non-empty string');
  }
  const text = description.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return rule.category;
    }
  }
  return DEFAULT_CATEGORY;
}

/**
 * Compute how much of a weekly/monthly budget limit has been spent for a
 * given category, and derive a status band used to drive the traffic-light
 * indicator shown on the BudgetMate dashboard screen.
 *
 * @param {Array<{category: string, amount: number}>} transactions Signed amounts; spending is negative.
 * @param {string} category The budget category to evaluate.
 * @param {number} limit The positive budget limit for that category, for the period.
 * @returns {{category: string, spent: number, limit: number, remaining: number, percentUsed: number, status: 'ok'|'warning'|'over'}}
 */
function calculateBudgetStatus(transactions, category, limit) {
  if (!Array.isArray(transactions)) {
    throw new TypeError('calculateBudgetStatus: transactions must be an array');
  }
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    throw new RangeError('calculateBudgetStatus: limit must be a positive finite number');
  }

  const spent = transactions
    .filter((t) => t.category === category && t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const remaining = Math.round((limit - spent) * 100) / 100;
  const percentUsed = Math.round((spent / limit) * 10000) / 100; // 2dp percentage

  let status = 'ok';
  if (spent > limit) {
    status = 'over';
  } else if (spent >= limit * 0.8) {
    status = 'warning';
  }

  return {
    category,
    spent: Math.round(spent * 100) / 100,
    limit,
    remaining,
    percentUsed,
    status,
  };
}

/**
 * Project how many whole weeks it will take to reach a savings goal at the
 * current average weekly contribution, and the projected completion date.
 *
 * @param {number} currentAmount Amount already saved toward the goal.
 * @param {number} targetAmount Target amount for the goal.
 * @param {number} weeklyContribution Average amount saved per week (must be > 0 if goal not yet met).
 * @param {Date} [from=new Date()] Date to project forward from (injectable for deterministic tests).
 * @returns {{weeksRemaining: number, projectedCompletionDate: string|null, onTrack: boolean}}
 */
function projectSavingsGoal(currentAmount, targetAmount, weeklyContribution, from = new Date()) {
  if ([currentAmount, targetAmount, weeklyContribution].some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new TypeError('projectSavingsGoal: currentAmount, targetAmount and weeklyContribution must be numbers');
  }
  if (targetAmount <= 0) {
    throw new RangeError('projectSavingsGoal: targetAmount must be positive');
  }

  const shortfall = targetAmount - currentAmount;

  if (shortfall <= 0) {
    return { weeksRemaining: 0, projectedCompletionDate: from.toISOString().slice(0, 10), onTrack: true };
  }

  if (weeklyContribution <= 0) {
    return { weeksRemaining: Infinity, projectedCompletionDate: null, onTrack: false };
  }

  const weeksRemaining = Math.ceil(shortfall / weeklyContribution);
  const projected = new Date(from.getTime() + weeksRemaining * 7 * 24 * 60 * 60 * 1000);

  return {
    weeksRemaining,
    projectedCompletionDate: projected.toISOString().slice(0, 10),
    onTrack: true,
  };
}

module.exports = {
  CATEGORY_RULES,
  DEFAULT_CATEGORY,
  categorizeTransaction,
  calculateBudgetStatus,
  projectSavingsGoal,
};
