import { z } from 'zod';
import {
    BACKLOG_STATES,
    FALLBACK_STATE,
    isCategoryId,
    isCustomId,
    normalizeCategoryColor,
    normalizeCategoryName,
    upgradeState,
    type CategoryId,
    type CustomId,
} from '../backlog/index.js';

// A retired state read from storage counts as its replacement
export const storedStateSchema = z.preprocess(
    upgradeState,
    z.custom<CategoryId>((value) => isCategoryId(value))
);

export const customIdSchema = z.custom<CustomId>((value) => isCustomId(value));

export const categoryNameSchema = z.string().transform((value, context) => {
    const name = normalizeCategoryName(value);
    if (name === null) context.addIssue({ code: 'custom', message: 'Invalid category name' });
    return name ?? '';
});

export const categoryColorSchema = z.string().transform((value, context) => {
    const color = normalizeCategoryColor(value);
    if (color === null) context.addIssue({ code: 'custom', message: 'Invalid category colour' });
    return color ?? '';
});

export const customCategorySchema = z.object({
    id: customIdSchema,
    name: categoryNameSchema,
    color: categoryColorSchema,
});

export const categoriesSchema = z.object({
    removed: z.array(z.enum(BACKLOG_STATES).refine((state) => state !== FALLBACK_STATE)),
    custom: z.array(customCategorySchema),
    colors: z.partialRecord(z.enum(BACKLOG_STATES), categoryColorSchema),
});

export const overrideSchema = z.object({
    state: storedStateSchema,
    setAt: z.string(),
    minutesAtSet: z.number().int().nonnegative(),
});

export const overridesSchema = z.record(z.string().regex(/^\d{1,10}$/), overrideSchema);

export const cachedBacklogSchema = z.object({ overrides: overridesSchema, categories: categoriesSchema });

export const overrideRowSchema = z.object({
    game_id: z.string(),
    state: storedStateSchema,
    minutes_at_set: z.number().int(),
    set_at: z.union([z.date(), z.string()]),
});

export const categoryRowSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('custom'), id: customIdSchema, name: z.string(), color: z.string() }),
    z.object({ kind: z.literal('removed'), id: z.enum(BACKLOG_STATES) }),
    z.object({ kind: z.literal('color'), id: z.enum(BACKLOG_STATES), color: z.string() }),
]);

export const categoryCreateRowSchema = z.object({
    inserted: z.number().int(),
    total: z.number().int(),
    taken: z.boolean(),
});

export const categoryUpdateRowSchema = z.object({ found: z.boolean(), taken: z.boolean() });

export const categoryDeleteRowSchema = z.object({ found: z.boolean(), used: z.boolean() });

export const stateRestoreRowSchema = z.object({ restored: z.number().int(), found: z.boolean() });

export const stateColorRowSchema = z.object({ found: z.boolean() });

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
