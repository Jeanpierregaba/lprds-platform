'use client'

import { useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { MarketingButton } from './marketing-button'
import { BRAND } from '@/lib/marketing/data'

const CHILD_AGES = [
  { value: '', label: 'Sélectionner (optionnel)' },
  { value: '3-18-mois', label: '3 – 18 mois' },
  { value: '18-24-mois', label: '18 – 24 mois' },
  { value: '24-36-mois', label: '24 – 36 mois' },
  { value: '3-8-ans', label: '3 – 8 ans' },
  { value: 'autre', label: 'Autre' },
]

const inputClass =
  'w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none ring-primary/30 transition-shadow focus:ring-3'

export function ContactForm() {
  const [values, setValues] = useState({ name: '', email: '', phone: '', childAge: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  const update = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('sending')
    const ageLabel = CHILD_AGES.find((a) => a.value === values.childAge)?.label
    const body = [
      `Nom : ${values.name}`,
      `Email : ${values.email}`,
      values.phone && `Téléphone : ${values.phone}`,
      values.childAge && `Âge de l'enfant : ${ageLabel}`,
      '',
      values.message,
    ].filter(Boolean).join('\n')
    const mailto = `mailto:${BRAND.email}?subject=${encodeURIComponent(`Demande de contact — ${values.name}`)}&body=${encodeURIComponent(body)}`
    window.location.href = mailto
    window.setTimeout(() => setStatus('sent'), 400)
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl bg-accent/10 p-6 text-center sm:p-10">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent/20">
          <Send className="size-6 text-accent" />
        </div>
        <h3 className="mt-4 font-display text-xl text-primary">Votre logiciel de messagerie s’est ouvert</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Il ne reste plus qu’à envoyer le message. Vous pouvez aussi nous écrire directement à{' '}
          <a href={`mailto:${BRAND.email}`} className="break-all font-medium text-primary underline">{BRAND.email}</a> ou nous
          joindre sur WhatsApp.
        </p>
        <MarketingButton className="mt-6" variant="outline" onClick={() => setStatus('idle')}>
          Envoyer un autre message
        </MarketingButton>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-foreground">Nom complet *</label>
          <input id="name" required value={values.name} onChange={update('name')} placeholder="Votre nom complet" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-foreground">Email *</label>
          <input id="email" type="email" required value={values.email} onChange={update('email')} placeholder="vous@exemple.com" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-foreground">Téléphone</label>
          <input id="phone" type="tel" value={values.phone} onChange={update('phone')} placeholder="+228 00 00 00 00" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="childAge" className="text-sm font-medium text-foreground">Âge de l’enfant</label>
          <select id="childAge" value={values.childAge} onChange={update('childAge')} className={inputClass}>
            {CHILD_AGES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="message" className="text-sm font-medium text-foreground">Message *</label>
        <textarea
          id="message"
          required
          rows={5}
          value={values.message}
          onChange={update('message')}
          placeholder="Parlez-nous de votre projet d’inscription ou de votre question..."
          className={inputClass}
        />
      </div>
      <MarketingButton type="submit" size="lg" className="w-full sm:w-auto" disabled={status === 'sending'}>
        {status === 'sending' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        Envoyer le message
      </MarketingButton>
    </form>
  )
}
