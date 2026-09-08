'use client'

import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <Button variant="ghost" size="icon" disabled aria-hidden />

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Thème sombre bientôt disponible"
      disabled
      title="Thème sombre bientôt disponible"
    >
      <Moon className="size-4" />
    </Button>
  )
}
