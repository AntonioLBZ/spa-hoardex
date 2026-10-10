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
    const [name, setName] = useState(initial?.name ?? '');
    const [color, setColor] = useState<string>(initial?.color ?? PALETTE[0]);
    const [invalid, setInvalid] = useState(false);
    const { pending, error, run } = useSubmit();

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const fields = { name: normalizeCategoryName(name), color: normalizeCategoryColor(color) };
        setInvalid(fields.name === null);
        if (fields.name === null || fields.color === null) return;
        const valid = { name: fields.name, color: fields.color };
        void run(async () => {
            await onSubmit(valid);
            if (initial === undefined) setName('');
        });
    }

    return (
        <form className="category-form" onSubmit={submit}>
            <TextField
                autoComplete="off"
                className="category-form__name"
                invalid={invalid}
                label={t('name')}
                message={t('nameHint', { max: MAX_CATEGORY_NAME })}
                onChange={(event) => setName(event.target.value)}
                value={name}
            />
            <ColorChoices onChange={(next) => setColor(next ?? PALETTE[0])} value={color} />
            <FormActions error={error} onCancel={onCancel} pending={pending} submitLabel={submitLabel} />
        </form>
    );
}

interface StateColorFormProps {
    // The state's own colour, and the one the owner gave it (null: its own)
    own: string;
    initial: string | null;
    submitLabel: string;
    // Rejects with an ApiError
    onSubmit: (color: string | null) => Promise<void>;
    onCancel: () => void;
}

// A built-in state keeps its name: only its colour changes, and it can go back to its own
export function StateColorForm({ own, initial, submitLabel, onSubmit, onCancel }: StateColorFormProps) {
    const [color, setColor] = useState(initial);
    const { pending, error, run } = useSubmit();

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const valid = color === null ? null : normalizeCategoryColor(color);
        if (color !== null && valid === null) return;
        void run(() => onSubmit(valid));
    }

    return (
        <form className="category-form" onSubmit={submit}>
            <ColorChoices onChange={setColor} own={own} value={color} />
            <FormActions error={error} onCancel={onCancel} pending={pending} submitLabel={submitLabel} />
        </form>
    );
}

// One submit at a time; a failure becomes the message to show
function useSubmit() {
    const describe = useCategoryError();
    const [error, setError] = useState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function run(send: () => Promise<void>) {
        if (pending) return;
        setPending(true);
        setError(null);
        try {
            await send();
        } catch (failure) {
            setError(describe(failure));
        } finally {
            setPending(false);
        }
    }

    return { pending, error, run };
}

interface ColorChoicesProps {
    // Null: the built-in state's own colour
    value: string | null;
    onChange: (color: string | null) => void;
    // A built-in state's own colour, offered first
    own?: string;
}

function ColorChoices({ value, onChange, own }: ColorChoicesProps) {
    const t = useTranslations('accountPage.categories');
    const groupName = useId();
    const [custom, setCustom] = useState(value?.startsWith('#') ? value : CUSTOM_START);

    return (
        <fieldset className="category-form__colors">
            <legend className="category-form__legend">{t('color')}</legend>
            {own === undefined ? null : (
                <label className="category-form__swatch category-form__swatch--labelled">
                    <input
                        checked={value === null}
                        className="category-form__radio visually-hidden"
                        name={groupName}
                        onChange={() => onChange(null)}
                        type="radio"
                    />
                    <span aria-hidden="true" className="category-form__dot" style={{ backgroundColor: own }} />
                    <span className="category-form__swatch-text">{t('ownColor')}</span>
                </label>
            )}
            {PALETTE.map((token, index) => (
                <label className="category-form__swatch" key={token} title={t('palette', { index: index + 1 })}>
                    <input
                        checked={value === token}
                        className="category-form__radio visually-hidden"
                        name={groupName}
                        onChange={() => onChange(token)}
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
            <label className="category-form__swatch category-form__swatch--labelled">
                <input
                    checked={value?.startsWith('#') ?? false}
                    className="category-form__radio visually-hidden"
                    name={groupName}
                    onChange={() => onChange(custom)}
                    type="radio"
                />
                <span aria-hidden="true" className="category-form__dot" style={{ backgroundColor: custom }} />
                <span className="category-form__swatch-text">{t('customColor')}</span>
            </label>
            <input
                aria-label={t('customColorLabel')}
                className="category-form__picker"
                onChange={(event) => {
                    setCustom(event.target.value);
                    onChange(event.target.value);
                }}
                type="color"
                value={custom}
            />
        </fieldset>
    );
}

interface FormActionsProps {
    submitLabel: string;
    pending: boolean;
    error: string | null;
    onCancel?: () => void;
}

function FormActions({ submitLabel, pending, error, onCancel }: FormActionsProps) {
    const t = useTranslations('accountPage.categories');
    return (
        <>
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
        </>
    );
}
