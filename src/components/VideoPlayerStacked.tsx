
'use client'

import { useEffect, useRef, useState, useLayoutEffect, Fragment } from 'react'
import attachHls from '@/lib/attachHls'
import { useVideo } from '@/context/VideoContext'
import { useModules } from '@/context/ModulesContext'
import { usePageState } from '@/context/PageStateContext'
import useIsMobile from '@/lib/hooks/useIsMobile'
import type { CSSProperties } from 'react'
import { timecodeToSeconds } from '@/lib/timecode'

const getVideoPlaybackId = (video: any) => {
  return (
    video?.asset?.playbackId ||
    video?.playbackId ||
    video?.asset?.data?.playback_ids?.[0]?.id ||
    video?.data?.playback_ids?.[0]?.id ||
    null
  )
}

const muxUrl = (playbackId: string | null) =>
  playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : null

const getMainUrl = (module: any) => muxUrl(getVideoPlaybackId(module?.video))
const getLoopUrl = (module: any) => muxUrl(getVideoPlaybackId(module?.idleVideo))

// Per-module object-position animation config (mobile drift).
type DriftPhase = { end: [number, number]; driftEnd: string; driftStart?: string }
type ModulePosition = {
  start: [number, number]
  end: [number, number]
  driftEnd?: string
  drifts?: DriftPhase[]
}
const MODULE_POSITIONS: ModulePosition[] = [
  // Module 0 (Prelude) — start must match intro end [53, 50]
  { start: [53, 50], end: [36, 50], driftEnd: '00;00;06;12' },
  // Module 1
  { start: [36, 50], end: [60, 40], driftEnd: '00;00;06;00' },
  // Module 2
  { start: [60, 40], end: [45, 35], drifts: [
    { end: [30, 15], driftEnd: '00;00;20;00' },
    { end: [45, 35], driftStart: '00;00;24;00', driftEnd: '00;00;28;00' },
  ]},
  { start: [45, 35], end: [45, 35] },
  { start: [50, 50], end: [50, 50] },
  { start: [50, 50], end: [50, 50] },
  { start: [50, 50], end: [50, 50] },
  { start: [50, 50], end: [50, 50] },
]

function lerpPosition(start: readonly number[], end: readonly number[], t: number): string {
  const clampedT = Math.max(0, Math.min(1, t))
  const x = start[0] + (end[0] - start[0]) * clampedT
  const y = start[1] + (end[1] - start[1]) * clampedT
  return `${x.toFixed(2)}% ${y.toFixed(2)}%`
}

export default function VideoPlayerStacked() {
  const { state: videoState, dispatch, playModule } = useVideo()
  const { state: modulesState } = useModules()
  const {
    state: pageState,
    setModulePage,
    isContentPanelExpanded,
  } = usePageState()
  const isMobile = useIsMobile()
  const buttonDuration = 500

  const [showDebug, setShowDebug] = useState(false)

  // Two refs per module: main playthrough and loop tail
  const mainRefs = useRef<(HTMLVideoElement | null)[]>([])
  const loopRefs = useRef<(HTMLVideoElement | null)[]>([])

  // Mobile drift: animated object-position written directly to DOM (no re-renders)
  const videoPositionsRef = useRef<string[]>([])

  const modules = modulesState.modules
  const currentIndex = videoState.currentModuleIndex

  // Track previous index for transition decision
  const prevIndexRef = useRef<number>(-1)
  // Mirror of videoState.isIdle from the previous render — captures whether the
  // previous module was in its loop phase (true) or mid-main (false) at the
  // moment SET_MODULE flipped isIdle back to false.
  const prevIsIdleRef = useRef<boolean>(true)
  const [, setRenderTick] = useState(0)
  const [shouldFade, setShouldFade] = useState(false)
  const [fadePhase, setFadePhase] = useState<'idle' | 'out' | 'in'>('idle')
  const isFadingRef = useRef(false)
  const fadeStartedRef = useRef(false)

  const [buttonVisible, setButtonVisible] = useState(false)

  // Mobile drift rAF: reads main video currentTime, writes objectPosition to both
  // main and loop elements so the loop inherits the drift's final position.
  useEffect(() => {
    if (!isMobile) return

    let rafId: number
    const tick = () => {
      // Skip while in loop phase — drift is frozen at its last value
      if (!videoState.isIdle) {
        for (let i = 0; i < modules.length; i++) {
          const mainRef = mainRefs.current[i]
          const loopRef = loopRefs.current[i]
          const pos = MODULE_POSITIONS[i]
          if (!mainRef || !pos) continue
          if (i !== currentIndex) continue

          const ct = mainRef.currentTime
          const dur = mainRef.duration
          let posStr: string

          if (pos.drifts && pos.drifts.length > 0) {
            let from: readonly number[] = pos.start
            posStr = lerpPosition(from, from, 0)

            for (let d = 0; d < pos.drifts.length; d++) {
              const drift = pos.drifts[d]
              const driftStartSec = drift.driftStart ? timecodeToSeconds(drift.driftStart) : (d === 0 ? 0 : null)
              const driftEndSec = timecodeToSeconds(drift.driftEnd)

              if (driftStartSec === null || driftEndSec === null || driftEndSec <= 0) {
                from = drift.end
                continue
              }

              if (ct < driftStartSec) {
                posStr = lerpPosition(from, from, 0)
                break
              } else if (ct >= driftStartSec && ct < driftEndSec) {
                const phaseDuration = driftEndSec - driftStartSec
                const linear = Math.min((ct - driftStartSec) / phaseDuration, 1)
                const eased = linear * linear * linear
                posStr = lerpPosition(from, drift.end, eased)
                break
              } else {
                from = drift.end
                posStr = lerpPosition(from, from, 0)
              }
            }
          } else {
            const driftEndSec = pos.driftEnd ? timecodeToSeconds(pos.driftEnd) : null
            const endPoint = driftEndSec ?? (dur && dur !== Infinity && dur > 0 ? dur : null)
            const linear = endPoint && endPoint > 0 ? Math.min(ct / endPoint, 1) : 0
            const eased = linear * linear * linear
            posStr = lerpPosition(pos.start, pos.end, eased)
          }

          videoPositionsRef.current[i] = posStr
          mainRef.style.objectPosition = posStr
          if (loopRef) loopRef.style.objectPosition = posStr
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isMobile, currentIndex, modules, videoState.isIdle])

  // Track isIdle across renders so the layout effect on currentIndex can read
  // the PREVIOUS module's phase. The reducer resets isIdle to false in SET_MODULE,
  // so we can't read videoState.isIdle directly — we capture it before the change.
  useEffect(() => {
    prevIsIdleRef.current = videoState.isIdle
  }, [videoState.isIdle])

  // Next Chapter button visibility
  useEffect(() => {
    let t: number | undefined
    setButtonVisible(false)
    if (videoState.isIdle && pageState.contentPanelStage !== 'hidden') {
      t = window.setTimeout(() => setButtonVisible(true), 1000)
    }
    return () => { if (t) clearTimeout(t) }
  }, [currentIndex, videoState.isIdle])

  useEffect(() => {
    let t: number | undefined
    if (videoState.isIdle && pageState.contentPanelStage !== 'hidden') {
      t = window.setTimeout(() => setButtonVisible(true), 1000)
    } else {
      setButtonVisible(false)
    }
    return () => { if (t) clearTimeout(t) }
  }, [videoState.isIdle])

  useEffect(() => {
    if (!videoState.isIdle) return
    let t: number | undefined
    if (pageState.contentPanelStage !== 'hidden') {
      t = window.setTimeout(() => setButtonVisible(true), 300)
    }
    return () => { if (t) clearTimeout(t) }
  }, [pageState.contentPanelStage])

  // Debug overlay toggle
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'd') setShowDebug((prev) => !prev)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Decide transition style on currentIndex change.
  // Rules: (main, *) -> fade. (loop, sequential next) -> instant. (loop, non-sequential) -> fade.
  // "From intro" (prev === -1) is handled by IntroOverlay.
  useLayoutEffect(() => {
    if (currentIndex === -1) return

    const prev = prevIndexRef.current
    if (prev === -1) {
      // From intro — IntroOverlay handled fade-to-black if needed. Just snap state.
      prevIndexRef.current = currentIndex
      setShouldFade(false)
      isFadingRef.current = false
      fadeStartedRef.current = false
      setRenderTick(c => c + 1)
      return
    }

    const isSequentialForward = currentIndex === prev + 1
    const wasInLoop = prevIsIdleRef.current
    const instantCut = wasInLoop && isSequentialForward

    if (instantCut) {
      // Loop -> next sequential main: no fade, no overlay. New main plays from 0.
      setShouldFade(false)
      isFadingRef.current = false
      fadeStartedRef.current = false

      if (isMobile) {
        const pos = MODULE_POSITIONS[currentIndex]
        if (pos) {
          const startPos = lerpPosition(pos.start, pos.end, 0)
          videoPositionsRef.current[currentIndex] = startPos
          const mainRef = mainRefs.current[currentIndex]
          const loopRef = loopRefs.current[currentIndex]
          if (mainRef) mainRef.style.objectPosition = startPos
          if (loopRef) loopRef.style.objectPosition = startPos
        }
      }
      prevIndexRef.current = currentIndex
      setRenderTick(c => c + 1)
      return
    }

    // Fade-to-black: (main, *) or (loop, non-sequential)
    setShouldFade(true)
    isFadingRef.current = true
    fadeStartedRef.current = true
    setFadePhase('out')

    // Ensure new module's main starts at 0 (SET_MODULE already cleared currentTime,
    // but the <video> element itself needs the seek).
    const newMain = mainRefs.current[currentIndex]
    if (newMain) {
      try { newMain.currentTime = 0 } catch {}
    }

    if (isMobile) {
      const pos = MODULE_POSITIONS[currentIndex]
      if (pos) {
        const startPos = lerpPosition(pos.start, pos.end, 0)
        videoPositionsRef.current[currentIndex] = startPos
        if (newMain) newMain.style.objectPosition = startPos
        const newLoop = loopRefs.current[currentIndex]
        if (newLoop) newLoop.style.objectPosition = startPos
      }
    }

    const outDuration = 300
    const inDuration = 300
    const inDelay = outDuration + 20

    const t1 = setTimeout(() => setFadePhase('in'), inDelay)
    const t2 = setTimeout(() => setFadePhase('idle'), inDelay + inDuration)
    const t3 = setTimeout(() => {
      setShouldFade(false)
      isFadingRef.current = false
      fadeStartedRef.current = false
      prevIndexRef.current = currentIndex
    }, inDelay + inDuration + outDuration)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [currentIndex])

  // Defer sequential-forward cuts from idle to the loop boundary so the cut lands
  // on the loop's last frame (authored to match the next module's frame 0).
  // Mirrors IntroOverlay's pendingPreludeFromIntro scheduler.
  useLayoutEffect(() => {
    const target = videoState.pendingSequentialTarget
    if (target === null) return
    if (!videoState.isIdle) return
    if (currentIndex < 0) return

    const fire = () => {
      dispatch({ type: 'SET_MODULE', payload: target })
      dispatch({ type: 'PLAY' })
      dispatch({ type: 'SET_PENDING_SEQUENTIAL', payload: null })
    }

    const loop = loopRefs.current[currentIndex]
    const dur = loop?.duration
    if (!loop || !dur || !isFinite(dur) || dur <= 0) {
      // Loop unavailable (e.g. fallback module with no idleVideo) — cut immediately.
      fire()
      return
    }

    // Fire ~30ms before wrap so the visible frame is the last frame of this cycle.
    const remainingMs = Math.max((dur - loop.currentTime) * 1000 - 30, 0)
    const t = setTimeout(fire, remainingMs)
    return () => clearTimeout(t)
  }, [videoState.pendingSequentialTarget, videoState.isIdle, currentIndex, dispatch])

  // Keep ref arrays sized to module count
  useEffect(() => {
    if (modules.length === 0) return
    mainRefs.current = Array.from({ length: modules.length }, (_, i) => mainRefs.current[i] ?? null)
    loopRefs.current = Array.from({ length: modules.length }, (_, i) => loopRefs.current[i] ?? null)
  }, [modules.length])

  // Attach HLS on module list update (refs are re-attached via the ref callbacks too,
  // but this covers initial mount and any URL changes from CMS edits)
  useEffect(() => {
    modules.forEach((m, idx) => {
      const mainUrl = getMainUrl(m)
      const loopUrl = getLoopUrl(m)
      const main = mainRefs.current[idx]
      const loop = loopRefs.current[idx]
      if (mainUrl && main) attachHls(main, mainUrl)
      if (loopUrl && loop) attachHls(loop, loopUrl)
    })
  }, [modules])

  // Play/pause: drive the currently visible element.
  useEffect(() => {
    if (currentIndex < 0 || currentIndex >= modules.length) return
    const fading = isFadingRef.current
    const main = mainRefs.current[currentIndex]
    const loop = loopRefs.current[currentIndex]
    const hasLoop = !!getLoopUrl(modules[currentIndex])

    if (videoState.isIdle) {
      // Loop phase
      if (main) try { main.pause() } catch {}
      if (hasLoop && loop) {
        if (!fading) {
          loop.play().catch(() => {})
        } else {
          try { loop.pause() } catch {}
        }
      }
      // Fallback (no loopVideo): main stays paused on its last frame, do nothing
    } else {
      // Main phase
      if (loop) try { loop.pause() } catch {}
      if (main) {
        const shouldPlay = !fading && videoState.isPlaying
        if (shouldPlay) {
          main.play().catch(() => {})
        } else {
          try { main.pause() } catch {}
        }
      }
    }

    // Reset all non-current modules to clean state
    mainRefs.current.forEach((ref, idx) => {
      if (!ref || idx === currentIndex) return
      if (fading && idx === prevIndexRef.current) {
        // Keep prev module visible during fade-out
        try { ref.pause() } catch {}
        return
      }
      try { ref.pause() } catch {}
      try { ref.currentTime = 0 } catch {}
    })
    loopRefs.current.forEach((ref, idx) => {
      if (!ref || idx === currentIndex) return
      if (fading && idx === prevIndexRef.current) {
        try { ref.pause() } catch {}
        return
      }
      try { ref.pause() } catch {}
      try { ref.currentTime = 0 } catch {}
    })

    // Prime the next sequential main so its first frame is decoded for instant cut
    if (!fading && videoState.isIdle) {
      const nextIdx = currentIndex + 1
      const nextMain = mainRefs.current[nextIdx]
      if (nextMain && nextMain.readyState < 2) {
        nextMain.muted = true
        nextMain.play()
          .then(() => {
            try { nextMain.pause() } catch {}
            try { nextMain.currentTime = 0 } catch {}
          })
          .catch(() => {})
      }
    }
  }, [currentIndex, videoState.isPlaying, videoState.isIdle, shouldFade, modules])

  // Pause previous video immediately when a non-sequential fade starts
  useLayoutEffect(() => {
    if (fadePhase === 'out') {
      const prevIdx = prevIndexRef.current
      const prevMain = mainRefs.current[prevIdx]
      const prevLoop = loopRefs.current[prevIdx]
      try { prevMain?.pause() } catch {}
      try { prevLoop?.pause() } catch {}
    }
  }, [fadePhase])

  const handleMainLoadedMetadata = (idx: number) => {
    const ref = mainRefs.current[idx]
    if (ref && idx === currentIndex) {
      dispatch({ type: 'SET_DURATION', payload: ref.duration })
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }

  const handleMainTimeUpdate = (idx: number) => {
    if (idx !== currentIndex) return
    if (videoState.isIdle) return
    const ref = mainRefs.current[idx]
    if (!ref) return
    dispatch({ type: 'SET_TIME', payload: ref.currentTime })
  }

  // Main video finished playing → enter loop phase (instant swap)
  const handleMainEnded = (idx: number) => {
    if (idx !== currentIndex) return
    if (videoState.isIdle) return
    const loop = loopRefs.current[idx]
    if (loop) {
      try { loop.currentTime = 0 } catch {}
      loop.play().catch(() => {})
    }
    dispatch({ type: 'SET_IDLE', payload: true })
  }

  // Safari sometimes silently pauses HLS — nudge back to playing
  const handlePause = (idx: number, kind: 'main' | 'loop') => {
    if (idx !== currentIndex || isFadingRef.current) return
    if (kind === 'main' && (!videoState.isPlaying || videoState.isIdle)) return
    if (kind === 'loop' && !videoState.isIdle) return
    const ref = kind === 'main' ? mainRefs.current[idx] : loopRefs.current[idx]
    if (!ref) return
    window.requestAnimationFrame(() => {
      const stillNeedsPlay =
        (kind === 'main' && videoState.isPlaying && !videoState.isIdle) ||
        (kind === 'loop' && videoState.isIdle)
      if (ref && ref.paused && stillNeedsPlay) {
        try { ref.play().catch(() => {}) } catch {}
      }
    })
  }

  // Compute opacity for a given module's main or loop element.
  const computeOpacity = (idx: number, kind: 'main' | 'loop'): number => {
    const prevIdx = prevIndexRef.current
    const inTransition = prevIdx !== currentIndex && !(prevIdx === -1 && currentIndex === 0)

    if (shouldFade || inTransition) {
      // During fade-out: show whichever element was visible on the previous module
      if (fadePhase === 'out' || (inTransition && !fadeStartedRef.current)) {
        if (idx !== prevIdx) return 0
        // Previous module's visible element
        const prevWasLoop = prevIsIdleRef.current
        if (prevWasLoop) return kind === 'loop' ? 1 : 0
        return kind === 'main' ? 1 : 0
      }
      // During fade-in or after fade started: show new module's main
      if (idx !== currentIndex) return 0
      return kind === 'main' ? 1 : 0
    }

    // Steady state (or instant cut just resolved)
    if (idx !== currentIndex) return 0
    if (videoState.isIdle) return kind === 'loop' ? 1 : 0
    return kind === 'main' ? 1 : 0
  }

  const buildDebugInfo = () => {
    return {
      currentIndex,
      prevIndex: prevIndexRef.current,
      prevIsIdle: prevIsIdleRef.current,
      fadePhase,
      shouldFade,
      isPlaying: videoState.isPlaying,
      isIdle: videoState.isIdle,
      videos: modules.map((m, idx) => {
        const main = mainRefs.current[idx]
        const loop = loopRefs.current[idx]
        return {
          idx,
          title: m?.title,
          main: { rs: main?.readyState, paused: main?.paused, t: main?.currentTime?.toFixed?.(2), d: main?.duration?.toFixed?.(2) },
          loop: { rs: loop?.readyState, paused: loop?.paused, t: loop?.currentTime?.toFixed?.(2), d: loop?.duration?.toFixed?.(2), exists: !!getLoopUrl(m) },
        }
      }),
    }
  }

  if (modules.length === 0) {
    return <div className="relative w-full h-full bg-black" />
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Video shift wrapper — translates videos up on mobile when content panel is visible */}
      <div
        className="absolute inset-0"
        style={{
          transform: isMobile
            ? pageState.contentPanelStage === 'expanded' ? 'translateY(-60vh)'
              : pageState.contentPanelStage === 'peek' ? 'translateY(-2rem)'
              : 'translateY(0)'
            : 'translateY(0)',
          transition: 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
      {modules.map((module, idx) => {
        const mainUrl = getMainUrl(module)
        if (!mainUrl) return null
        const loopUrl = getLoopUrl(module)
        const initialPos = isMobile
          ? lerpPosition(
              (MODULE_POSITIONS[idx] || MODULE_POSITIONS[0]).start,
              (MODULE_POSITIONS[idx] || MODULE_POSITIONS[0]).start,
              0,
            )
          : isContentPanelExpanded ? 'calc(50% - 90px) 50%' : '50% 50%'

        return (
          <Fragment key={idx}>
            <video
              data-module-video={idx}
              data-role="main"
              ref={(el: HTMLVideoElement | null) => {
                mainRefs.current[idx] = el
                if (el && mainUrl) attachHls(el, mainUrl)
              }}
              preload="auto"
              muted
              playsInline
              crossOrigin="anonymous"
              className="absolute top-0 left-0 w-full h-full object-cover"
              style={{
                opacity: computeOpacity(idx, 'main'),
                zIndex: (idx + 1) * 2,
                objectPosition: isMobile ? (videoPositionsRef.current[idx] || initialPos) : initialPos,
                transition: shouldFade || fadePhase !== 'idle'
                  ? 'opacity 0.3s ease-in-out'
                  : 'none',
              }}
              onLoadedMetadata={() => handleMainLoadedMetadata(idx)}
              onTimeUpdate={() => handleMainTimeUpdate(idx)}
              onEnded={() => handleMainEnded(idx)}
              onPause={() => handlePause(idx, 'main')}
              onLoadStart={() => dispatch({ type: 'SET_LOADING', payload: true })}
              onError={() => dispatch({ type: 'SET_LOADING', payload: false })}
            />
            {loopUrl && (
              <video
                data-module-video-loop={idx}
                data-role="loop"
                ref={(el: HTMLVideoElement | null) => {
                  loopRefs.current[idx] = el
                  if (el && loopUrl) attachHls(el, loopUrl)
                }}
                preload="auto"
                muted
                playsInline
                loop
                crossOrigin="anonymous"
                className="absolute top-0 left-0 w-full h-full object-cover"
                style={{
                  opacity: computeOpacity(idx, 'loop'),
                  zIndex: (idx + 1) * 2 + 1,
                  objectPosition: isMobile ? (videoPositionsRef.current[idx] || initialPos) : initialPos,
                  transition: shouldFade || fadePhase !== 'idle'
                    ? 'opacity 0.3s ease-in-out'
                    : 'none',
                }}
                onPause={() => handlePause(idx, 'loop')}
              />
            )}
          </Fragment>
        )
      })}

      {/* Black overlay for fade-to-black transitions */}
      <div
        data-loop-overlay
        className="absolute top-0 left-0 w-full h-full bg-black"
        style={{
          opacity: shouldFade && fadePhase !== 'idle' ? 1 : 0,
          zIndex: modules.length * 2 + 10,
          transition: 'opacity 0.3s ease-in-out',
          pointerEvents: 'none',
        }}
      />

      </div>

      {/* Next Chapter button (idle only, not during intro) */}
      {currentIndex >= 0 && currentIndex < modules.length - 1 && (
        <button
          type="button"
          onClick={() => {
            setButtonVisible(false)
            const nextIdx = currentIndex + 1
            playModule(nextIdx)
            const nextModule = modules[nextIdx]
            if (nextModule?.slug?.current) {
              setModulePage(nextIdx, nextModule.slug.current)
            }
            window.dispatchEvent(new CustomEvent('mobile-module-bar-scroll', { detail: { index: nextIdx } }))
          }}
          className="absolute bg-black text-light font-serif font-normal text-xs tracking-wide uppercase border-light border hover:bg-light hover:text-black px-5 py-2 z-40"
          style={{
            left: '50%',
            bottom: (() => {
              if (!isMobile) return '1rem'
              const stage = pageState.currentPage === 'module' && !pageState.isTopMenuOpen
                ? pageState.contentPanelStage
                : 'hidden'
              const panelLift = stage === 'expanded' ? '70vh' : stage === 'peek' ? '4rem' : '0px'
              return `calc(var(--mobile-module-bar-height, 0px) + ${panelLift} + 0.5rem)`
            })(),
            transform: (() => {
              if (isMobile) return 'translateX(-50%)'
              const sidebarOffset = 90
              const panelOffset = isContentPanelExpanded ? 192 : 0
              return `translateX(calc(-50% - ${sidebarOffset + panelOffset}px))`
            })(),
            opacity: buttonVisible && !(isMobile && pageState.isTopMenuOpen) ? 1 : 0,
            transition: shouldFade
              ? 'none'
              : `bottom 500ms cubic-bezier(0.4, 0, 0.2, 1), transform 500ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${buttonDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            pointerEvents: buttonVisible && !(isMobile && pageState.isTopMenuOpen) ? 'auto' : 'none',
          } as CSSProperties}
        >
          Next Chapter
        </button>
      )}

      {showDebug && (
        <pre className="absolute bottom-0 left-0 w-full max-h-60 overflow-auto bg-black/70 text-green-300 text-xs p-2 z-[9999]">
          {JSON.stringify(buildDebugInfo(), null, 2)}
        </pre>
      )}
    </div>
  )
}
