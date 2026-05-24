'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { urlFor } from '@/lib/sanity'

export type EnlargeStage = 'closed' | 'opening' | 'open' | 'closing-fade' | 'closing-color'

interface Props {
  images: any[]
  index: number | null
  stage: EnlargeStage
  onClose: () => void
  onNavigate: (delta: number) => void
}

function getOriginalDimensions(value: any): { w: number; h: number } {
  let w: number | undefined = value?.asset?.metadata?.dimensions?.width
  let h: number | undefined = value?.asset?.metadata?.dimensions?.height
  if (!w || !h) {
    const ref: string | undefined = value?.asset?._ref
    const match = ref?.match(/-(\d+)x(\d+)-/)
    if (match) {
      w = parseInt(match[1], 10)
      h = parseInt(match[2], 10)
    }
  }
  return { w: w || 1600, h: h || 1200 }
}

const CROSSFADE_MS = 200

interface SlotState {
  image: any | null
  key: number
}

function ImageSlot({
  image,
  visible,
  onImageClick,
}: {
  image: any | null
  visible: boolean
  onImageClick: (e: React.MouseEvent) => void
}) {
  if (!image) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    )
  }
  const { w: origW } = getOriginalDimensions(image)
  const src = urlFor(image).width(origW).quality(95).url()
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: visible ? 1 : 0,
        transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
        pointerEvents: visible ? 'auto' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <img
        src={src}
        alt={image.alt || ''}
        onClick={onImageClick}
        style={{
          maxWidth: '95vw',
          maxHeight: 'calc(95vh - 160px)',
          objectFit: 'contain',
          cursor: 'zoom-out',
          display: 'block',
        }}
      />
      {image.caption && (
        <p
          onClick={(e) => e.stopPropagation()}
          className="text-xs italic text-light"
          style={{
            position: 'absolute',
            bottom: '1.5rem',
            left: '1.5rem',
            maxWidth: '65ch',
            margin: 0,
            fontFamily: 'Baskervville',
            textAlign: 'left',
          }}
        >
          {image.caption}
        </p>
      )}
    </div>
  )
}

export default function ImageEnlargeModal({ images, index, stage, onClose, onNavigate }: Props) {
  const [mounted, setMounted] = useState(false)
  const [slotA, setSlotA] = useState<SlotState>({ image: null, key: 0 })
  const [slotB, setSlotB] = useState<SlotState>({ image: null, key: 0 })
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A')
  const lastIndexRef = useRef<number | null>(null)
  const slotCounterRef = useRef(0)

  useEffect(() => {
    setMounted(true)
  }, [])

  const urlFor95 = (img: any) => {
    const { w } = getOriginalDimensions(img)
    return urlFor(img).width(w).quality(95).url()
  }

  const waitForImage = (url: string, cb: () => void) => {
    const el = new window.Image()
    el.src = url
    if (el.complete && el.naturalWidth > 0) {
      cb()
      return
    }
    el.onload = cb
    el.onerror = cb
  }

  // Preload current + next + previous as soon as the modal opens (or index moves)
  useEffect(() => {
    if (index == null) return
    const n = images.length
    if (n === 0) return
    const targets = [index, (index + 1) % n, (index - 1 + n) % n]
    targets.forEach((i) => {
      const img = images[i]
      if (!img) return
      const el = new window.Image()
      el.src = urlFor95(img)
    })
  }, [index, images])

  // Drive crossfade slots from the parent index
  useEffect(() => {
    const currentImage = index != null ? images[index] : null

    if (index == null) {
      // Modal closing — let stage drive the fade-out; do NOT clear slots immediately
      // (otherwise the visible image disappears at t=0 of close instead of fading).
      lastIndexRef.current = null
      return
    }

    // First time opening
    if (lastIndexRef.current == null) {
      slotCounterRef.current += 1
      setSlotA({ image: currentImage, key: slotCounterRef.current })
      setSlotB({ image: null, key: 0 })
      setActiveSlot('A')
      lastIndexRef.current = index
      return
    }

    if (lastIndexRef.current === index) return

    // Navigation: stage new image in inactive slot, then flip active slot only
    // once the new image has actually decoded so the crossfade lands on pixels,
    // not on a blank slot.
    slotCounterRef.current += 1
    const url = urlFor95(currentImage)
    const targetSlot: 'A' | 'B' = activeSlot === 'A' ? 'B' : 'A'

    if (targetSlot === 'B') {
      setSlotB({ image: currentImage, key: slotCounterRef.current })
    } else {
      setSlotA({ image: currentImage, key: slotCounterRef.current })
    }
    lastIndexRef.current = index

    waitForImage(url, () => {
      requestAnimationFrame(() => setActiveSlot(targetSlot))
    })
  }, [index, images, activeSlot])

  // Keyboard: ESC closes, arrow keys navigate
  useEffect(() => {
    if (stage === 'closed') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowRight') {
        onNavigate(1)
      } else if (e.key === 'ArrowLeft') {
        onNavigate(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stage, onClose, onNavigate])

  if (!mounted || stage === 'closed') return null

  const overlayVisible = stage === 'open'
  const handleImageClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  const showChevrons = images.length > 1 && overlayVisible

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'black',
        opacity: overlayVisible ? 1 : 0,
        transition: 'opacity 300ms ease-in-out',
        pointerEvents: stage === 'opening' ? 'none' : 'auto',
      }}
    >
      <ImageSlot image={slotA.image} visible={activeSlot === 'A'} onImageClick={handleImageClick} />
      <ImageSlot image={slotB.image} visible={activeSlot === 'B'} onImageClick={handleImageClick} />

      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute z-20 top-0 right-0 p-1 hover:bg-dark rounded transition-colors"
        aria-label="Close enlarged image"
      >
        <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {showChevrons && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-20"
          style={{
            bottom: '1.5rem',
            right: '1.5rem',
            display: 'flex',
            gap: '0rem',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(-1)
            }}
            className="p-1 hover:bg-dark rounded transition-colors"
            aria-label="Previous image"
          >
            <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onNavigate(1)
            }}
            className="p-1 hover:bg-dark rounded transition-colors"
            aria-label="Next image"
          >
            <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )

  return createPortal(overlay, document.body)
}
