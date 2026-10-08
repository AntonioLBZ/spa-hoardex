import { useNavigate } from '@tanstack/react-router';
import { useId, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/button';
import { riseStyle } from '@/lib/motion';
import { toProfileSlug } from '@/lib/profile-slug';

import './entry-form.scss';

export function EntryForm() {
    const t = useTranslations('entry');
    const navigate = useNavigate();
    const [value, setValue] = useState('');
    const [invalid, setInvalid] = useState(false);
    const inputId = useId();
    const messageId = useId();

    function onChange(event: ChangeEvent<HTMLInputElement>) {
        setValue(event.target.value);
        setInvalid(false);
    }

    function onSubmit(event: SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        const profile = toProfileSlug(value);
        if (profile === null) {
            setInvalid(true);
            return;
        }
        void navigate({ to: '/p/$profile', params: { profile } });
    }

    return (
        <form className="entry-form rise-in" noValidate onSubmit={onSubmit} style={riseStyle(1)}>
            <label className="entry-form__label" htmlFor={inputId}>
                {t('label')}
            </label>
            <div className="entry-form__row">
                <input
                    aria-describedby={messageId}
                    aria-invalid={invalid}
                    autoCapitalize="off"
                    autoComplete="off"
                    className="entry-form__input"
                    id={inputId}
                    onChange={onChange}
                    placeholder={t('placeholder')}
                    spellCheck={false}
                    type="text"
                    value={value}
                />
                <Button type="submit">{t('submit')}</Button>
            </div>
            <p
                className={invalid ? 'entry-form__message entry-form__message--error' : 'entry-form__message'}
                id={messageId}
                role={invalid ? 'alert' : undefined}
            >
                {invalid ? t('invalid') : t('hint')}
            </p>
        </form>
    );
}
