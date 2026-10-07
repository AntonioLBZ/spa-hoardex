import { demoLibraryQuery, demoProfileQuery, libraryQuery, profileQuery } from '@/lib/api';
import type { ProfileSource } from './profile-page';

export function profileQueryFor(source: ProfileSource) {
    return source.kind === 'demo' ? demoProfileQuery() : profileQuery(source.input);
}

export function libraryQueryFor(source: ProfileSource) {
    return source.kind === 'demo' ? demoLibraryQuery() : libraryQuery(source.input);
}
