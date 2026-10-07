import en from '../../assets/locales/en.json';
import es from '../../assets/locales/es.json';
import type { AppLocale } from './locale';

export type AppMessages = typeof en;

// Typed against English, so a missing or extra key in another language fails the build
export const MESSAGES: Record<AppLocale, AppMessages> = { en, es };
