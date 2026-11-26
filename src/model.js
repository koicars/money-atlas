// Money Atlas — data model.
// Plain ES module, no dependencies: runs in the browser and in Node.

export const SCHEMA_VERSION = 1;

/** Why the money was spent. `null` = not tagged yet. */
export const TAGS = /** @type {const} */ (['need', 'grow', 'waste']);

/** How a category's monthly budget behaves at month end. */
export const CARRYOVER = /** @type {const} */ ([
  'reset',   // leftover and overspend both vanish
  'surplus', // leftover rolls into next month, overspend vanishes
  'both',    // leftover and overspend both roll over (a sinking fund)
]);

/**
 * @typedef {'need'|'grow'|'waste'} Tag
 *
 * @typedef {Object} TagChange
 * @property {Tag|null} tag
 * @property {string} at            ISO timestamp
 * @property {'import'|'user'} by
 *
 * @typedef {Object} Entry          One expense.
 * @property {string} id
 * @property {string} date          'YYYY-MM-DD'
 * @property {number} amount        Yen, integer, >= 0
 * @property {string} categoryId
 * @property {string} memo          Free text ('' when empty)
 * @property {Tag|null} tag
 * @property {TagChange[]} tagHistory  Every tag the entry has had; never rewritten
 * @property {'card'|null} payment
 * @property {string|null} recurringId Set when posted by a recurring item
 * @property {string[]} flags       Import warnings to review ('year-inferred', …)
 * @property {Object|null} source   Original row when imported
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} name          Display name
 * @property {'variable'|'sinking'} kind
 * @property {'reset'|'surplus'|'both'} carryover
 * @property {Tag} defaultTag       Pre-selected when recording
 * @property {boolean} archived
 *
 * @typedef {Object} Recurring      A subscription or fixed cost, posted automatically.
 * @property {string} id
 * @property {string} name
 * @property {number} amount
 * @property {'monthly'|'yearly'} cycle
 * @property {string} nextDate      'YYYY-MM-DD'
 * @property {string} categoryId
 * @property {Tag} tag
 * @property {'fixed'|'subscription'|'savings'} kind  'savings' = 先取り貯蓄, never counted as spending
 * @property {number|null} remindDaysBefore  null = no renewal reminder
 * @property {boolean} active
 *
 * @typedef {Object} Budget
 * @property {Object<string, number>} standard            categoryId -> yen per month
 * @property {Object<string, Object<string, number>>} overrides  'YYYY-MM' -> categoryId -> yen
 */

/**
 * Categories of the old ExpenseBook app, mapped to Money Atlas.
 * Key = the old app's category text (trimmed). Several keys may share an id (merges).
 * @type {Object<string, Omit<Category, 'archived'>>}
 */
export const EXPENSEBOOK_CATEGORIES = {
  'foods':            { id: 'food',      name: '食費',     kind: 'variable', carryover: 'reset',   defaultTag: 'need' },
  'カフェ':            { id: 'cafe',      name: 'カフェ',   kind: 'variable', carryover: 'reset',   defaultTag: 'need' },
  'drinking session': { id: 'drinks',    name: '飲み会',   kind: 'variable', carryover: 'surplus', defaultTag: 'need' },
  'hobby/amusement':  { id: 'hobby',     name: '趣味',     kind: 'variable', carryover: 'surplus', defaultTag: 'need' },
  'commodities':      { id: 'daily',     name: '日用品',   kind: 'variable', carryover: 'reset',   defaultTag: 'need' },
  'traffic':          { id: 'transport', name: '交通',     kind: 'variable', carryover: 'reset',   defaultTag: 'need' },
  'beauty':           { id: 'beauty',    name: '美容',     kind: 'variable', carryover: 'surplus', defaultTag: 'need' },
  'book':             { id: 'books',     name: '本',       kind: 'variable', carryover: 'surplus', defaultTag: 'grow' },
  'design':           { id: 'design',    name: 'デザイン', kind: 'variable', carryover: 'surplus', defaultTag: 'grow' },
  'other':            { id: 'other',     name: 'その他',   kind: 'variable', carryover: 'reset',   defaultTag: 'need' },
  'clothing':         { id: 'clothing',  name: '服',       kind: 'sinking',  carryover: 'both',    defaultTag: 'need' },
  'clothes':          { id: 'clothing',  name: '服',       kind: 'sinking',  carryover: 'both',    defaultTag: 'need' },
  'Travel':           { id: 'travel',    name: '旅行',     kind: 'sinking',  carryover: 'both',    defaultTag: 'need' },
  'car goods':        { id: 'car',       name: '車',       kind: 'sinking',  carryover: 'both',    defaultTag: 'need' },
};
