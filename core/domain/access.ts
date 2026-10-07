// Access states are data; transport failures and upstream 5xx are UpstreamError
export type ProfileAccess<T> =
    | { kind: 'ok'; data: T }
    | { kind: 'profilePrivate' }
    | { kind: 'libraryPrivate' }
    | { kind: 'wishlistPrivate' }
    | { kind: 'notFound' }
    | { kind: 'rateLimited'; retryAfterSeconds?: number };

export type ProfileAccessKind = ProfileAccess<unknown>['kind'];
