export {
    BACKLOG_STATES,
    DEFAULT_BACKLOG_THRESHOLDS,
    MANUAL_STATES,
    MAX_BULK_CHANGE,
    classifyGame,
    countByState,
    isBacklog,
    resolveState,
    upgradeState,
} from './classify.js';
export type {
    BacklogOverride,
    BacklogState,
    BacklogThresholds,
    ManualState,
    Overrides,
    StateOptions,
} from './classify.js';
