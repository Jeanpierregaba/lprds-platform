'use client'

import { LayoutGrid, List, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils/cn'

/** Champ de recherche avec icône loupe (M4). */
export function SearchInput({
  value, onChange, placeholder, id, inputClassName,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  id?: string
  inputClassName?: string
}) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        placeholder={placeholder}
        className={cn('pl-8', inputClassName)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export type ViewMode = 'table' | 'cards'

/** Bascule vue liste / cartes (M5). Boutons 40px : compromis tactile qui
 * reste compact dans les barres de filtres (le 44px strict casserait leur
 * hauteur d'alignement avec les selects h-9). */
export function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (view: ViewMode) => void }) {
  return (
    <div className="ml-auto flex items-center gap-1 rounded-md border border-border bg-accent p-0.5">
      <Button
        type="button"
        variant={view === 'table' ? 'default' : 'ghost'}
        size="icon-sm"
        className="h-10 w-10"
        aria-label="Vue en liste"
        aria-pressed={view === 'table'}
        onClick={() => onChange('table')}
      >
        <List className="size-4" />
      </Button>
      <Button
        type="button"
        variant={view === 'cards' ? 'default' : 'ghost'}
        size="icon-sm"
        className="h-10 w-10"
        aria-label="Vue en cartes"
        aria-pressed={view === 'cards'}
        onClick={() => onChange('cards')}
      >
        <LayoutGrid className="size-4" />
      </Button>
    </div>
  )
}

/** Switch « Inclure les inactifs » (M6). */
export function InactiveSwitch({
  id, checked, onCheckedChange, label,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="text-sm text-white font-semibold">{label}</Label>
    </div>
  )
}
