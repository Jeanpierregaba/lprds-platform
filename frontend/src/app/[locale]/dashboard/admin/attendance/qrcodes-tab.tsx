'use client'

import { useTranslations } from 'next-intl'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Baby, Check, Copy, Download, IdCard, QrCode, Search, UserRound } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { attendanceApi } from '@/lib/api/attendance.api'
import { childrenApi } from '@/lib/api/children.api'
import { staffApi } from '@/lib/api/staff.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { CardPreviewModal } from '@/components/card-preview-modal'
import { PillsTabsList, PillsTrigger, TabPanel } from '@/components/dashboard/shared/tabs'
import { displayName } from '@/lib/utils/display-name'

export function QrCodesTab() {
  const t = useTranslations('attendance')

  return (
    <div className="pt-2">
      <Tabs defaultValue="children">
        <PillsTabsList>
          <PillsTrigger value="children" active="primary" icon={Baby}>
            {t('qr.children')}
          </PillsTrigger>
          <PillsTrigger value="staff" active="teal" icon={UserRound}>
            {t('qr.staff')}
          </PillsTrigger>
        </PillsTabsList>
        <TabPanel value="children">
          <PersonQrCode personType="child" />
        </TabPanel>
        <TabPanel value="staff">
          <PersonQrCode personType="staff" />
        </TabPanel>
      </Tabs>
    </div>
  )
}

function PersonQrCode({ personType }: { personType: 'child' | 'staff' }) {
  const t = useTranslations('attendance')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCardModal, setShowCardModal] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // La sélection survit à la frappe (seul un changement d'onglet la
  // réinitialise) : affiner la recherche ne fait plus disparaître le QR.
  useEffect(() => setSelectedId(null), [personType])

  // Seuil de 2 lettres + 10 premiers résultats (comme l'export) : à 1
  // lettre le bruit noie les résultats sans prévenir l'utilisateur.
  const searchActive = debouncedSearch.trim().length >= 2
  const { data: childResults, isLoading: isSearchingChildren } = useQuery({
    queryKey: ['children', { search: debouncedSearch }],
    queryFn: () => childrenApi.list({ search: debouncedSearch || undefined, limit: 10 }).then((r) => r.data),
    enabled: personType === 'child' && searchActive,
  })

  const { data: staffResults, isLoading: isSearchingStaff } = useQuery({
    queryKey: ['staff', { search: debouncedSearch }],
    queryFn: () => staffApi.list({ search: debouncedSearch || undefined, limit: 10 }).then((r) => r.data),
    enabled: personType === 'staff' && searchActive,
  })

  const isSearching = personType === 'child' ? isSearchingChildren : isSearchingStaff

  const results = personType === 'child'
    ? (childResults?.items.map((c) => ({ id: c.id, label: `${c.first_names} ${c.last_name}`, sub: c.matricule })) ?? [])
    : (staffResults?.items.map((s) => ({ id: s.id, label: displayName(s), sub: s.matricule })) ?? [])

  const { data: qrcode, isLoading: isLoadingQr, error } = useQuery({
    queryKey: ['attendance', 'qrcode', personType, selectedId],
    queryFn: () =>
      (personType === 'child' ? attendanceApi.getChildQrcode(selectedId!) : attendanceApi.getStaffQrcode(selectedId!))
        .then((r) => r.data),
    enabled: !!selectedId,
  })

  const selected = results.find((r) => r.id === selectedId)

  const { data: childDetail } = useQuery({
    queryKey: ['children', selectedId],
    queryFn: () => childrenApi.get(selectedId!).then((r) => r.data),
    enabled: personType === 'child' && !!selectedId,
  })

  const cardData =
    childDetail && qrcode
      ? {
          qrImage: qrcode.qr_image,
          matricule: qrcode.matricule,
          firstName: childDetail.first_names,
          lastName: childDetail.last_name,
          section: childDetail.section?.name ?? '',
        }
      : null

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('qr.search')}</CardTitle>
          <CardDescription>
            {personType === 'child' ? t('qr.searchHintChild') : t('qr.searchHintStaff')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('qr.searchPlaceholder')}
              aria-label={t('qr.searchAria')}
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {searchActive && (
            <div className="divide-y divide-border rounded-md border border-border">
              {isSearching ? (
                <div className="space-y-2 p-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : results.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">{t('qr.noResult')}</p>
              ) : (
                <>
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`flex w-full items-center justify-between gap-2 p-3 text-left text-sm transition-colors hover:bg-muted ${
                        selectedId === r.id ? 'bg-muted' : ''
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{r.sub ?? '—'}</span>
                    </button>
                  ))}
                  <p className="p-2 text-center text-xs text-muted-foreground">{t('qr.topResults')}</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('qr.title')}</CardTitle>
          <CardDescription>{selected ? selected.label : t('qr.selectPerson')}</CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedId ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <QrCode className="size-8" />
              <p className="text-sm">{t('qr.noSelection')}</p>
            </div>
          ) : isLoadingQr ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Skeleton className="size-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{getApiErrorMessage(error)}</p>
          ) : qrcode ? (
            <div className="flex flex-col items-center gap-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI, no next/image optimization to gain */}
              <img
                src={qrcode.qr_image}
                alt={t('qr.imageAlt', { name: selected?.label ?? '' })}
                className="size-48 rounded-md border border-border bg-white p-2"
              />
              <p className="font-mono text-sm text-muted-foreground">{qrcode.matricule}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {/* Matricule unique des deux côtés (plus de slug prénom —
                  collisions entre homonymes) comme nom de fichier. */}
                <Button variant="outline" size="sm" render={<a href={qrcode.qr_image} download={`qr-${qrcode.matricule}.png`} />}>
                  <Download className="mr-1.5 size-4" />
                  {t('qr.download')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(qrcode.qr_payload)
                      setTokenCopied(true)
                      setTimeout(() => setTokenCopied(false), 2000)
                    } catch {
                      toast.error(t('qr.copyFailed'))
                    }
                  }}
                >
                  {tokenCopied ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
                  {tokenCopied ? t('qr.copied') : t('qr.copyToken')}
                </Button>
              </div>
              <p className="max-w-xs text-center text-xs text-muted-foreground">
                {t('qr.tokenHint')}
              </p>
              {personType === 'child' && cardData && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowCardModal(true)}
                >
                  <IdCard className="mr-1.5 size-4" />
                  {t('generateCard')}
                </Button>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {cardData && (
        <CardPreviewModal
          open={showCardModal}
          onOpenChange={setShowCardModal}
          cardData={cardData}
        />
      )}
    </div>
  )
}
