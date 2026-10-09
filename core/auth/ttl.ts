// Sign-in lifetimes in seconds; the privacy policy states them
export const AUTH_TTL = {
    session: 30 * 24 * 60 * 60, // 30 days
    // The pending sign-in cookie, and how long a used Steam nonce is remembered
    login: 10 * 60, // 10 minutes
} as const;
