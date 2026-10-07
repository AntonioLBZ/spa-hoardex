import { Redis } from '@upstash/redis';

export interface RedisConfig {
    url: string;
    token: string;
    // Key prefix, so environments sharing the database do not collide
    namespace: string;
}

export function createRedis({ url, token }: RedisConfig) {
    return new Redis({ url, token });
}

export function nsKey({ namespace }: Pick<RedisConfig, 'namespace'>, ...parts: string[]) {
    return [namespace, ...parts].join(':');
}
