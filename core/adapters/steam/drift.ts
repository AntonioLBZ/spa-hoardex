import type { ZodError } from 'zod';

// Response that did not match the schema; issues are Zod paths and codes, never values
export interface SteamDriftReport {
    endpoint: string;
    issues: string[];
}

export type SteamDriftHandler = (report: SteamDriftReport) => void;

const MAX_ISSUES = 20;

export const warnDrift: SteamDriftHandler = ({ endpoint, issues }) => {
    console.warn(`[steam] response shape drift in ${endpoint}: ${issues.join('; ')}`);
};

// One "path: code" per issue; messages can quote upstream data
export function describeIssues(error: ZodError, prefix: readonly PropertyKey[] = []): string[] {
    return error.issues.map((issue) => {
        const path = [...prefix, ...issue.path].map(String).join('.');
        return `${path === '' ? '(root)' : path}: ${issue.code}`;
    });
}

// Caps the report size
export function capIssues(issues: readonly string[]): string[] {
    if (issues.length <= MAX_ISSUES) return [...issues];
    return [...issues.slice(0, MAX_ISSUES), `+${issues.length - MAX_ISSUES} more`];
}
