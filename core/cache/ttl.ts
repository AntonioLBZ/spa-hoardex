// TTLs in seconds
export const CACHE_TTL = {
    alias: 24 * 60 * 60, // 1 day
    profile: 2 * 60 * 60, // 2 hours
    library: 60 * 60, // 1 hour
    private: 60, // 1 minute
    notFound: 5 * 60, // 5 minutes
    // Cooldown between manual refreshes of one account, and the shorter one after a failed refresh
    refresh: 10 * 60, // 10 minutes
    refreshRetry: 60, // 1 minute
    // Copy of an account's manual states; every write renews it
    backlog: 24 * 60 * 60, // 1 day
} as const;
