import { useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';

import { MAX_CATEGORY_NAME, PALETTE, normalizeCategoryColor, normalizeCategoryName } from '@core/backlog';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import type { CategoryFields } from '@/lib/api';
import { colorValue } from '@/lib/categories';
import { useCategoryError } from './category-error';

import './category-form.scss';

// What the native colour picker starts on before one is chosen
const CUSTOM_START = '#8a5cf6';

interface CategoryFormProps {
    // Absent: a new category
    initial?: CategoryFields;
    submitLabel: string;
    // Rejects with an ApiError
    onSubmit: (fields: CategoryFields) => Promise<void>;
    onCancel?: () => void;
}

// A name and a colour: one of the palette's, or any as #rrggbb
export function CategoryForm({ initial, submitLabel, onSubmit, onCancel }: CategoryFormProps) {
    const t = useTranslations('accountPage.categories');
    const describe = useCategoryError();
    const groupName = useId();
    const [name, setName] = useState(initial?.name ?? '');
    const [color, setColor] = useState(initial?.color ?? PALETTE[0]);
    const [custom, setCustom] = useState(color.startsWith('#') ? color : CUSTOM_START);
    const [invalid, setInvalid] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (pending) return;
        const fields = { name: normalizeCategoryName(name), color: normalizeCategoryColor(color) };
        setInvalid(fields.name === null);
        if (fields.name === null || fields.color === null) return;
        setPending(true);
        setError(null);
        try {
            await onSubmit({ name: fields.name, color: fields.color });
            if (initial === undefined) setName('');
        } catch (failure) {
            setError(describe(failure));
        } finally {
            setPending(false);
        }
    }

    return (
        <form className="category-form" onSubmit={(event) => void submit(event)}>
            <TextField
                autoComplete="off"
                className="category-form__name"
                invalid={invalid}
                label={t('name')}
                message={t('nameHint', { max: MAX_CATEGORY_NAME })}
                onChange={(event) => setName(event.target.value)}
                value={name}
            />
            <fieldset className="category-form__colors">
                <legend className="category-form__legend">{t('color')}</legend>
                {PALETTE.map((token, index) => (
                    <label className="category-form__swatch" key={token} title={t('palette', { index: index + 1 })}>
                        <input
                            checked={color === token}
                            className="category-form__radio visually-hidden"
                            name={groupName}
                            onChange={() => setColor(token)}
                            type="radio"
                        />
                        <span
                            aria-hidden="true"
                            className="category-form__dot"
                            style={{ backgroundColor: colorValue(token) }}
                        />
                        <span className="visually-hidden">{t('palette', { index: index + 1 })}</span>
                    </label>
                ))}
                <label className="category-form__swatch category-form__swatch--custom">
                    <input
                        checked={color.startsWith('#')}
                        className="category-form__radio visually-hidden"
                        name={groupName}
                        onChange={() => setColor(custom)}
                        type="radio"
                    />
                    <span aria-hidden="true" className="category-form__dot" style={{ backgroundColor: custom }} />
                    <span className="category-form__custom-text">{t('customColor')}</span>
                </label>
                <input
                    aria-label={t('customColorLabel')}
                    className="category-form__picker"
                    onChange={(event) => {
                        setCustom(event.target.value);
                        setColor(event.target.value);
                    }}
                    type="color"
                    value={custom}
                />
            </fieldset>
            <div className="category-form__actions">
                <Button aria-disabled={pending} size="small" type="submit">
                    {submitLabel}
                </Button>
                {onCancel === undefined ? null : (
                    <Button onClick={onCancel} size="small" variant="secondary">
                        {t('cancel')}
                    </Button>
                )}
            </div>
            {error === null ? null : (
                <p className="category-form__error" role="alert">
                    {error}
                </p>
            )}
        </form>
    );
}
