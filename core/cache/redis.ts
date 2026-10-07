import { Redis } from '@upstash/redis';

export interface RedisConfig {
    url: string;
    token: string;
    // Keys are prefixed with it so local/preview tests never touch production data (one free DB shared by all)
    namespace: string;
}

export function createRedis({ url, token }: RedisConfig) {
    return new Redis({ url, token });
}

export function nsKey({ namespace }: Pick<RedisConfig, 'namespace'>, ...parts: string[]) {
    return [namespace, ...parts].join(':');
}
