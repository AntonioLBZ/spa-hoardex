import type { AppMessages } from './messages';

declare module 'use-intl' {
    interface AppConfig {
        Messages: AppMessages;
    }
}
