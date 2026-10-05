'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const t = useTranslations('common')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <Button variant="ghost" size="icon" disabled aria-hidden />

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('themeSoon')}
      disabled
      title={t('themeSoon')}
    >
      <Moon className="size-4" />
    </Button>
  )
}
