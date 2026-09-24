'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import jsQR from 'jsqr'
import { toast } from 'sonner'
import { AlertTriangle, Camera, CheckCircle2, Keyboard, Loader2, QrCode, User, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { attendanceApi } from '@/lib/api/attendance.api'
import { getApiErrorMessage } from '@/lib/utils/api-error'
import { cn } from '@/lib/utils/cn'
import { ConfirmDialog } from '@/components/dashboard/shared/dialogs'
import type { AttendanceEvent, EventType, VerifyQrResponse } from '@/types/attendance'

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  arrival: 'Arrivée',
  departure: 'Départ',
  meal: 'Cantine',
}

type CameraState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported'

function personLabel(event: AttendanceEvent) {
  const person = event.child ?? event.staff
  if (!person) return '—'
  return person.nickname || `${person.first_names ?? person.first_name ?? ''} ${person.last_name}`.trim()
}

interface EventOption {
  type: EventType
  label: string
  suggested: boolean
}

function buildOptions(verified: VerifyQrResponse): EventOption[] {
  const isChild = verified.person_type === 'child'
  const options: EventOption[] = []

  if (isChild) {
    // Enfant : Arrivée puis Départ. Le voyant suggère Départ si arrivé mais pas parti.
    const suggested = verified.has_arrived && !verified.has_departed
    options.push({ type: 'arrival', label: EVENT_TYPE_LABELS.arrival, suggested: !suggested })
    options.push({ type: 'departure', label: EVENT_TYPE_LABELS.departure, suggested })
  } else {
    // Personnel : Arrivée → Cantine → Départ. Priorité au prochain geste logique.
    let suggestedType: EventType
    if (!verified.has_arrived) suggestedType = 'arrival'
    else if (!verified.has_meal) suggestedType = 'meal'
    else if (!verified.has_departed) suggestedType = 'departure'
    else suggestedType = 'arrival' // cycle complet : on repart sur une arrivée

    options.push({ type: 'arrival', label: EVENT_TYPE_LABELS.arrival, suggested: suggestedType === 'arrival' })
    options.push({ type: 'meal', label: EVENT_TYPE_LABELS.meal, suggested: suggestedType === 'meal' })
    options.push({ type: 'departure', label: EVENT_TYPE_LABELS.departure, suggested: suggestedType === 'departure' })
  }
  return options
}

export function ScanTab() {
  const queryClient = useQueryClient()

  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualPayload, setManualPayload] = useState('')

  const [decodedPayload, setDecodedPayload] = useState<string | null>(null)
  const [verified, setVerified] = useState<VerifyQrResponse | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const [selectedType, setSelectedType] = useState<EventType | null>(null)
  const [companionName, setCompanionName] = useState('')
  const [companionPhone, setCompanionPhone] = useState('')
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  const stopCamera = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const scanLoop = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code?.data) {
          stopCamera()
          setCameraState('idle')
          setDecodedPayload(code.data)
          return
        }
      }
    }
    frameRef.current = requestAnimationFrame(scanLoop)
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported')
      return
    }
    setCameraState('starting')
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState('scanning')
      frameRef.current = requestAnimationFrame(scanLoop)
    } catch (err) {
      setCameraState('denied')
      // Messages navigateur bruts (souvent anglais) traduits en clair.
      const raw = err instanceof Error ? err.message : ''
      setCameraError(
        /permission|denied|notallowed/i.test(raw)
          ? "Accès à la caméra refusé — autorisez-la dans les réglages du navigateur."
          : /notfound|nodevice|no device/i.test(raw)
            ? 'Aucune caméra détectée sur cet appareil.'
            : /notreadable|inuse|track/i.test(raw)
              ? 'Caméra déjà utilisée par une autre application.'
              : "Impossible d'accéder à la caméra."
      )
    }
  }, [scanLoop])

  useEffect(() => () => stopCamera(), [stopCamera])

  const resetToIdle = () => {
    stopCamera()
    setDecodedPayload(null)
    setVerified(null)
    setScanError(null)
    setSelectedType(null)
    setCompanionName('')
    setCompanionPhone('')
    setConfirmDuplicate(false)
  }

  // ── Étape 1 : validation du QR scanné (aucun événement créé) ──
  const verifyMutation = useMutation({
    mutationFn: (payload: string) => attendanceApi.verifyScan(payload).then((r) => r.data),
    onSuccess: (v) => {
      setVerified(v)
      setScanError(null)
      setSelectedType(null)
      setCompanionName('')
      setCompanionPhone('')
    },
    onError: (err) => {
      const msg = getApiErrorMessage(err)
      setScanError(msg)
      setVerified(null)
    },
  })

  useEffect(() => {
    if (decodedPayload && !verified && !verifyMutation.isPending && !scanError) {
      verifyMutation.mutate(decodedPayload)
    }
  }, [decodedPayload, verified, verifyMutation, scanError])

  // ── Étape 2 : enregistrement du scan aprés choix de l'événement ──
  const scanMutation = useMutation({
    mutationFn: () =>
      attendanceApi.scan({
        qr_payload: decodedPayload!,
        event_type: selectedType!,
        companion_name: companionName || undefined,
        companion_phone: companionPhone || undefined,
      }).then((r) => r.data),
    onSuccess: (event) => {
      toast.success(`${EVENT_TYPE_LABELS[event.event_type]} enregistré(e) — ${personLabel(event)}`)
      queryClient.invalidateQueries({ queryKey: ['attendance'] })
      resetToIdle()
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  })

  const onManualSubmit = () => {
    if (!manualPayload.trim()) return
    stopCamera()
    setCameraState('idle')
    setScanError(null)
    setVerified(null)
    setDecodedPayload(manualPayload.trim())
    setManualPayload('')
  }

  const isChild = verified?.person_type === 'child'
  const eventOptions = verified ? buildOptions(verified) : []

  // Le geste choisi existe-t-il déjà aujourd'hui ? Si oui, on demande
  // confirmation avant de créer un doublon (journal append-only).
  const selectedAlreadyDone = !!verified && !!selectedType && (
    (selectedType === 'arrival' && verified.has_arrived) ||
    (selectedType === 'departure' && verified.has_departed) ||
    (selectedType === 'meal' && verified.has_meal)
  )

  const onValidate = () => {
    if (!selectedType || scanMutation.isPending) return
    if (selectedAlreadyDone) {
      setConfirmDuplicate(true)
      return
    }
    scanMutation.mutate()
  }

  // ── Rendu ─────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-md space-y-4 pt-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scanner un badge</CardTitle>
          <CardDescription>Activez la caméra et présentez le QR code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {decodedPayload && verified && eventOptions.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                {isChild ? <Users className="size-4 shrink-0 text-primary" /> : <User className="size-4 shrink-0 text-primary" />}
                <div className="text-sm">
                  <p className="font-medium text-foreground">{verified.display_name}</p>
                  <p className="text-muted-foreground">
                    {isChild ? 'Enfant' : 'Personnel'}
                    {verified.matricule ? ` · ${verified.matricule}` : ''}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Choisissez l&apos;événement</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {eventOptions.map((opt) => (
                    <Button
                      key={opt.type}
                      type="button"
                      variant={selectedType === opt.type ? 'default' : 'outline'}
                      size="lg"
                      className={cn('justify-start', opt.suggested && selectedType !== opt.type && 'animate-suggest')}
                      onClick={() => setSelectedType(opt.type)}
                    >
                      {opt.suggested && <span className="size-2 shrink-0 rounded-full bg-current animate-pulse" />}
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {eventOptions.some((o) => o.suggested)
                    ? 'Le voyant clignotant indique l&apos;événement suggéré en fonction du pointage du jour.'
                    : 'Aucune suggestion — pointez le geste souhaité.'}
                </p>
              </div>

              {isChild && selectedType && selectedType !== 'meal' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="companion_name">Accompagnateur (enfant, optionnel)</Label>
                    <Input id="companion_name" value={companionName} onChange={(e) => setCompanionName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="companion_phone">Téléphone accompagnateur</Label>
                    <Input id="companion_phone" value={companionPhone} onChange={(e) => setCompanionPhone(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={resetToIdle} disabled={scanMutation.isPending}>
                  Annuler
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={onValidate}
                  disabled={!selectedType || scanMutation.isPending}
                >
                  {scanMutation.isPending ? <><Loader2 className="mr-1.5 size-4 animate-spin" /> Enregistrement...</> : 'Valider'}
                </Button>
              </div>
              <ConfirmDialog
                open={confirmDuplicate}
                onOpenChange={setConfirmDuplicate}
                title="Événement déjà pointé aujourd'hui"
                description={`Ce geste (${selectedType ? EVENT_TYPE_LABELS[selectedType].toLowerCase() : ''}) existe déjà pour ${verified?.display_name ?? 'cette personne'} aujourd'hui. Créer quand même un doublon ?`}
                confirmLabel="Pointer quand même"
                onConfirm={() => {
                  setConfirmDuplicate(false)
                  scanMutation.mutate()
                }}
              />
            </div>
          ) : decodedPayload && verified === null ? (
            <div className="space-y-4">
              {scanError ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-2">
                    <p className="font-medium">QR code invalide</p>
                    <p className="text-muted-foreground">{scanError}</p>
                    <Button type="button" variant="outline" size="sm" onClick={resetToIdle}>
                      Scanner un autre badge
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                  <span><CheckCircle2 className="mr-1 inline size-4" /> Vérification du QR code...</span>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="relative aspect-square w-full overflow-hidden rounded-md border border-border bg-black">
                <video ref={videoRef} className="size-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
                {cameraState !== 'scanning' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center text-white">
                    {cameraState === 'denied' ? (
                      <>
                        <AlertTriangle className="size-8 text-destructive" />
                        <p className="text-sm">Accès caméra refusé ou indisponible.</p>
                        {cameraError && <p className="text-xs text-white/70">{cameraError}</p>}
                      </>
                    ) : cameraState === 'unsupported' ? (
                      <>
                        <AlertTriangle className="size-8 text-destructive" />
                        <p className="text-sm">Caméra non prise en charge par ce navigateur.</p>
                      </>
                    ) : cameraState === 'starting' ? (
                      <>
                        <Loader2 className="size-8 animate-spin text-white/70" />
                        <p className="text-sm text-white/70">Démarrage...</p>
                      </>
                    ) : (
                      <QrCode className="size-8 text-white/70" />
                    )}
                  </div>
                )}
              </div>

              <Button type="button" onClick={startCamera} disabled={cameraState === 'starting' || cameraState === 'scanning'} className="w-full">
                <Camera className="mr-1.5 size-4" />
                Scanner
              </Button>

              <details className="rounded-md border border-border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  <Keyboard className="mr-1.5 inline size-4" />
                  Saisie manuelle (dépannage)
                </summary>
                <div className="mt-3 flex gap-2">
                  <Input
                    placeholder="Coller le jeton QR..."
                    value={manualPayload}
                    onChange={(e) => setManualPayload(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onManualSubmit() }}
                  />
                  <Button type="button" variant="outline" onClick={onManualSubmit}>Envoyer</Button>
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
