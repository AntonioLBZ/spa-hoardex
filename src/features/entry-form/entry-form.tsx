import { useNavigate } from '@tanstack/react-router';
import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { riseStyle } from '@/lib/motion';
import { toProfileSlug } from '@/lib/profile-slug';

import './entry-form.scss';

export function EntryForm() {
    const t = useTranslations('entry');
    const navigate = useNavigate();
    const [value, setValue] = useState('');
    const [invalid, setInvalid] = useState(false);

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
        <form className="entry-form rise-in" noValidate onSubmit={onSubmit} style={riseStyle(3)}>
            <TextField
                autoCapitalize="off"
                autoComplete="off"
                end={<Button type="submit">{t('submit')}</Button>}
                icon={
                    <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                    </svg>
                }
                invalid={invalid}
                label={t('label')}
                message={invalid ? t('invalid') : t('hint')}
                onChange={onChange}
                placeholder={t('placeholder')}
                raised
                spellCheck={false}
                type="text"
                value={value}
            />
        </form>
    );
}
