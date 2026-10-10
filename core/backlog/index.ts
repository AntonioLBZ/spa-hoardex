export { BACKLOG_STATES, DEFAULT_BACKLOG_THRESHOLDS, MAX_BULK_CHANGE, classifyGame, upgradeState } from './classify.js';
export type { BacklogOverride, BacklogState, BacklogThresholds, Overrides } from './classify.js';
export {
    COLOR_PATTERN,
    CUSTOM_ID_PATTERN,
    DEFAULT_CATEGORIES,
    FALLBACK_STATE,
    MAX_CATEGORIES,
    MAX_CATEGORY_NAME,
    PALETTE,
    canCreateCategory,
    categoryIds,
    computedState,
    countByState,
    hasCategory,
    isBuiltInState,
    isCategoryId,
    isCustomId,
    normalizeCategoryColor,
    normalizeCategoryName,
    resolveState,
    sameCategoryName,
} from './categories.js';
export type {
    BacklogData,
    Categories,
    CategoryCounts,
    CategoryId,
    CustomCategory,
    CustomId,
    StateOptions,
} from './categories.js';
