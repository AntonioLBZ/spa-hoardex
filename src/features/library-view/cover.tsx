import { useState, type CSSProperties } from 'react';

import type { EntityId } from '@core/domain';
import { coverUrls } from '@/lib/covers';
import { isBusy } from '@/lib/motion/busy';

import './cover.scss';

// Stable colour per game, so placeholders do not all look alike
function hueOf(key: string): number {
    let hash = 7;
    for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return hash % 360;
}

function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter((word) => word !== '')
        .slice(0, 2)
        .map((word) => Array.from(word)[0])
        .join('')
        .toUpperCase();
}

interface CoverProps {
    id: EntityId;
    name: string;
    // False for games whose images do not exist, such as the demo library
    withImages: boolean;
}

// Tries each candidate image in turn and ends on a coloured placeholder
export function Cover({ id, name, withImages }: CoverProps) {
    const [failed, setFailed] = useState(0);
    const url = withImages ? coverUrls(id)[failed] : undefined;
    // Landscape fallback: shown whole, not cropped
    const className = failed > 0 && url !== undefined ? 'cover cover--landscape' : 'cover';

    return (
        <div className={className} style={{ '--hue': hueOf(id.externalId) } as CSSProperties}>
            {url === undefined ? (
                <span aria-hidden="true" className="cover__initials">
                    {initialsOf(name)}
                </span>
            ) : (
                <img
                    alt=""
                    className="cover__image"
                    decoding="async"
                    height={900}
                    loading="lazy"
                    onError={() => setFailed((count) => count + 1)}
                    onLoad={(event) => {
                        event.currentTarget.dataset.loaded = isBusy() ? 'instant' : 'fade';
                    }}
                    referrerPolicy="no-referrer"
                    src={url}
                    width={600}
                />
            )}
        </div>
    );
}
