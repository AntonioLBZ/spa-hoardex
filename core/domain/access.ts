// Access states are data, not exceptions: the UI renders each one. Transport failures and upstream 5xx are
// exceptions (`UpstreamError`) so TanStack Query can retry them.
export type ProfileAccess<T> =
    | { kind: 'ok'; data: T }
    | { kind: 'profilePrivate' }
    | { kind: 'libraryPrivate' }
    | { kind: 'wishlistPrivate' }
    | { kind: 'notFound' }
    | { kind: 'rateLimited'; retryAfterSeconds?: number };

export type ProfileAccessKind = ProfileAccess<unknown>['kind'];
