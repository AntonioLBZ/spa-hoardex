import type { ZodError } from 'zod';

// Steam answered, but not with the shape we expect. `issues` hold Zod paths and codes only, never values
export interface SteamDriftReport {
    endpoint: string;
    issues: string[];
}

export type SteamDriftHandler = (report: SteamDriftReport) => void;

const MAX_ISSUES = 20;

export const warnDrift: SteamDriftHandler = ({ endpoint, issues }) => {
    console.warn(`[steam] response shape drift in ${endpoint}: ${issues.join('; ')}`);
};

// One `path: code` entry per Zod issue. The message is left out on purpose: it can quote upstream data
export function describeIssues(error: ZodError, prefix: readonly PropertyKey[] = []): string[] {
    return error.issues.map((issue) => {
        const path = [...prefix, ...issue.path].map(String).join('.');
        return `${path === '' ? '(root)' : path}: ${issue.code}`;
    });
}

// A broken upstream could break every entry of a library: keep the report small
export function capIssues(issues: readonly string[]): string[] {
    if (issues.length <= MAX_ISSUES) return [...issues];
    return [...issues.slice(0, MAX_ISSUES), `+${issues.length - MAX_ISSUES} more`];
}
