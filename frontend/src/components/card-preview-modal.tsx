'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileDown, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  type CardData,
  generateCardImage,
  downloadCardPng,
  downloadCardPdf,
} from '@/lib/utils/card-generator'

interface CardPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cardData: CardData
}

export function CardPreviewModal({ open, onOpenChange, cardData }: CardPreviewModalProps) {
  const [cardImage, setCardImage] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const generatedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setCardImage(null)
      setError(null)
      generatedRef.current = false
      return
    }

    if (generatedRef.current) return
    generatedRef.current = true

    setGenerating(true)
    generateCardImage(cardData)
      .then(setCardImage)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Erreur de génération'))
      .finally(() => setGenerating(false))
  }, [open, cardData])

  const handlePng = useCallback(() => {
    if (cardImage) downloadCardPng(cardImage, cardData)
  }, [cardImage, cardData])

  const handlePdf = useCallback(() => {
    if (cardImage) downloadCardPdf(cardImage, cardData)
  }, [cardImage, cardData])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Carte scolaire</DialogTitle>
          <DialogDescription>
            {cardData.firstName} {cardData.lastName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          {generating ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Génération en cours…</p>
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : cardImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URI
            <img
              src={cardImage}
              alt={`Carte de ${cardData.firstName} ${cardData.lastName}`}
              className="max-h-[60vh] rounded-lg border border-border"
            />
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePng}
            disabled={!cardImage}
          >
            <Download className="mr-1.5 size-4" />
            PNG
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePdf}
            disabled={!cardImage}
          >
            <FileDown className="mr-1.5 size-4" />
            PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
