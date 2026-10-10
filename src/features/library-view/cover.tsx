import { clsx } from 'clsx';
import { useContext, useState, type CSSProperties } from 'react';

import type { EntityId, GameArt } from '@core/domain';
import { ArtOwnerContext, requestArt } from '@/lib/art';
import { coverSources } from '@/lib/covers';
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

// Tries each candidate image in turn and ends on a coloured placeholder.
// When the guessed portrait fails (recent games keep theirs under hashed paths), asks the store for its own paths
export function Cover({ id, name, withImages }: CoverProps) {
    const owner = useContext(ArtOwnerContext);
    const [failed, setFailed] = useState(0);
    // Undefined: not asked; 'asking': waiting for the answer
    const [art, setArt] = useState<GameArt | null | 'asking'>();
    const source = withImages && art !== 'asking' ? coverSources(id, art)[failed] : undefined;
    const url = source?.url;
    const className = clsx('cover', source?.landscape === true && 'cover--landscape');

    function onError() {
        if (art === undefined && failed === 0 && owner !== null) {
            setArt('asking');
            void requestArt(owner, id).then((answer) => {
                setFailed(0);
                setArt(answer);
            });
            return;
        }
        setFailed((count) => count + 1);
    }

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
                    onError={onError}
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
