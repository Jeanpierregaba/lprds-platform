'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Send } from 'lucide-react'
import { MarketingButton } from './marketing-button'
import { BRAND } from '@/lib/marketing/data'

const CHILD_AGE_KEYS = [
  { value: '', key: 'placeholder' },
  { value: '3-18-mois', key: 'a' },
  { value: '18-24-mois', key: 'b' },
  { value: '24-36-mois', key: 'c' },
  { value: '3-8-ans', key: 'd' },
  { value: 'autre', key: 'other' },
] as const

const inputClass =
  'w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/30 transition-shadow focus:ring-3'

export function ContactForm() {
  const t = useTranslations('marketing.contactForm')
  const ages = CHILD_AGE_KEYS.map(({ value, key }) => ({ value, label: t(`ages.${key}`) }))
  const [values, setValues] = useState({ name: '', email: '', phone: '', childAge: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  const update = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    const ageLabel = ages.find((a) => a.value === values.childAge)?.label
    const body = [
      `${t('mail.name')} : ${values.name}`,
      `${t('mail.email')} : ${values.email}`,
      values.phone && `${t('mail.phone')} : ${values.phone}`,
      values.childAge && `${t('mail.childAge')} : ${ageLabel}`,
      '',
      values.message,
    ].filter(Boolean).join('\n')
    const mailto = `mailto:${BRAND.email}?subject=${encodeURIComponent(t('mail.subject', { name: values.name }))}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
    window.setTimeout(() => setStatus('sent'), 400)
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl bg-accent/10 p-6 text-center sm:p-10">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent/20">
          <Send className="size-6 text-accent" />
        </div>
        <h3 className="mt-4 font-display text-xl text-primary">{t('sent.title')}</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {t('sent.body')}{' '}
          <a href={`mailto:${BRAND.email}`} className="break-all font-medium text-primary underline">{BRAND.email}</a>{' '}
          {t('sent.bodyEnd')}
        </p>
        <MarketingButton className="mt-6" variant="outline" onClick={() => setStatus('idle')}>
          {t('sent.again')}
        </MarketingButton>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-foreground">{t('fields.name')}</label>
          <input id="name" required value={values.name} onChange={update('name')} placeholder={t('fields.namePlaceholder')} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">{t('fields.email')}</label>
          <input id="email" type="email" required value={values.email} onChange={update('email')} placeholder={t('fields.emailPlaceholder')} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-foreground">{t('fields.phone')}</label>
          <input id="phone" type="tel" value={values.phone} onChange={update('phone')} placeholder={t('fields.phonePlaceholder')} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="childAge" className="text-sm font-medium text-foreground">{t('fields.childAge')}</label>
          <select id="childAge" value={values.childAge} onChange={update('childAge')} className={inputClass}>
            {ages.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="message" className="text-sm font-medium text-foreground">{t('fields.message')}</label>
        <textarea
          id="message"
          required
          rows={5}
          value={values.message}
          onChange={update('message')}
          placeholder={t('fields.messagePlaceholder')}
          className={inputClass}
        />
      </div>
      <MarketingButton type="submit" size="lg" className="w-full sm:w-auto" disabled={status === 'sending'}>
        {status === 'sending' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {t('submit')}
      </MarketingButton>
    </form>
  )
}
