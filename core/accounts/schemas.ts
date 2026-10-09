import { z } from 'zod';
import { MANUAL_STATES, upgradeState } from '../backlog/index.js';

// A retired state read from storage counts as its replacement
export const storedStateSchema = z.preprocess(upgradeState, z.enum(MANUAL_STATES));

export const overrideSchema = z.object({
    state: storedStateSchema,
    setAt: z.string(),
    minutesAtSet: z.number().int().nonnegative(),
});

export const overridesSchema = z.record(z.string().regex(/^\d{1,10}$/), overrideSchema);

export const cachedOverridesSchema = z.object({ overrides: overridesSchema });

export const overrideRowSchema = z.object({
    game_id: z.string(),
    state: storedStateSchema,
    minutes_at_set: z.number().int(),
    set_at: z.union([z.date(), z.string()]),
});

export const accountRowSchema = z.object({ user_id: z.string(), session_epoch: z.number().int() });

export const settingsRowSchema = z.object({
    snapshots_opt_in_at: z.union([z.date(), z.string()]).nullable(),
    snapshot_days: z.number().int(),
    last_snapshot_on: z.string().nullable(),
});

export const snapshotResultSchema = z.object({ taken: z.number().int(), changed: z.number().int() });

export const snapshotAccountRowSchema = z.object({
    user_id: z.string(),
    source: z.literal('steam'),
    external_id: z.string(),
});
