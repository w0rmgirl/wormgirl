'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import attachHls from '@/lib/attachHls'
import LoadingDots from '@/components/LoadingDots'
import { client } from '@/lib/sanity'
import { useVideo } from '@/context/VideoContext'
import { useModules } from '@/context/ModulesContext'
import { usePageState } from '@/context/PageStateContext'
import useIsMobile from '@/lib/hooks/useIsMobile'
import { timecodeToSeconds } from '@/lib/timecode'

const SIDEBAR_OFFSET_CLASS = 'w-full lg:w-[calc(100vw-180px)]'

// Per-clip object-position animation. The intro's `end` MUST match prelude (module 0)'s `start`.
const VIDEO_POSITIONS = {
  intro: { start: [50, 50], end: [53, 50], driftEnd: '00;00;05;12' },
} as const

function lerpPosition(start: readonly number[], end: readonly number[], t: number): string {
  const clampedT = Math.max(0, Math.min(1, t))
  const x = start[0] + (end[0] - start[0]) * clampedT
  const y = start[1] + (end[1] - start[1]) * clampedT
  return `${x.toFixed(2)}% ${y.toFixed(2)}%`
}

const INTRO_QUERY = `*[_type == "intro"][0]{
  video { asset-> { playbackId } },
  idleVideo { asset-> { playbackId } },
  buttonLabel
}`

function getPlaybackId(video: any): string | null {
  return (
    video?.asset?.playbackId ||
    video?.playbackId ||
    video?.asset?.data?.playback_ids?.[0]?.id ||
    video?.data?.playback_ids?.[0]?.id ||
    null
  )
}

export default function IntroOverlay({ onFinish }: { onFinish: () => void }) {
  const mainRef = useRef<HTMLVideoElement | null>(null)
  const loopRef = useRef<HTMLVideoElement | null>(null)
  const [mainUrl, setMainUrl] = useState<string | null>(null)
  const [loopUrl, setLoopUrl] = useState<string | null>(null)
  const [buttonLabel, setButtonLabel] = useState('PRELUDE')
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  // Intro phase: 'main' while the zoom plays, 'loop' once it has ended and the loop took over
  const [introPhase, setIntroPhase] = useState<'main' | 'loop'>('main')
  const [blackOverlay, setBlackOverlay] = useState(false)
  const [overlayOpacity, setOverlayOpacity] = useState(1)
  const [pendingPrelude, setPendingPrelude] = useState(false)
  const { state: videoState, dispatch, playModule, introPreludeRef: pendingPreludeRef } = useVideo()
  const { state: modulesState } = useModules()
  const { setModulePage, isContentPanelExpanded, state: pageState } = usePageState()
  const isMobile = useIsMobile()

  const introDriftEnd = timecodeToSeconds(VIDEO_POSITIONS.intro.driftEnd)

  const [showDebug, setShowDebug] = useState(false)

  // iOS Safari prime: a paused <video> with readyState=4 may still have no
  // decoded frame in its compositor layer until .play() runs once. During the
  // intro, module 0's main element is never primed by VideoPlayerStacked's
  // priming pass (which gates on currentIndex >= 0). Prime it here when the
  // intro enters loop phase so the opacity flip at cut-time reveals a real
  // frame, not a blank layer.
  const preludePrimedRef = useRef(false)
  useEffect(() => {
    if (introPhase !== 'loop') return
    if (preludePrimedRef.current) return
    const el = document.querySelector<HTMLVideoElement>('video[data-module-video="0"][data-role="main"]')
    if (!el) return
    preludePrimedRef.current = true
    el.muted = true
    el.play()
      .then(() => {
        try { el.pause() } catch {}
        try { el.currentTime = 0 } catch {}
      })
      .catch(() => { preludePrimedRef.current = false })
  }, [introPhase])

  // Fallback: if video never becomes ready, show button anyway after timeout
  const [fallbackReady, setFallbackReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setFallbackReady(true), 4000)
    return () => clearTimeout(timer)
  }, [])

  const [buttonDismissed, setButtonDismissed] = useState(false)
  const [showLoading, setShowLoading] = useState(false)

  // Button is shown only once we've reached the loop phase (main finished playing).
  // This keeps the original "zoom plays first, button appears at rest" behavior.
  const buttonShouldShow =
    introPhase === 'loop' &&
    (isVideoReady || fallbackReady) &&
    !isClosing &&
    !buttonDismissed &&
    !modulesState.loading &&
    modulesState.modules.length > 0

  const isClosingRef = useRef(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'd') setShowDebug(prev => !prev)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Fetch intro settings from Sanity once
  useEffect(() => {
    client
      .fetch(INTRO_QUERY)
      .then((data) => {
        const mainPid = getPlaybackId(data?.video)
        if (mainPid) setMainUrl(`https://stream.mux.com/${mainPid}.m3u8`)
        const loopPid = getPlaybackId(data?.idleVideo)
        if (loopPid) setLoopUrl(`https://stream.mux.com/${loopPid}.m3u8`)
        if (data?.buttonLabel) setButtonLabel(data.buttonLabel)
      })
      .catch(() => {})
  }, [])

  // Attach HLS to whichever element has its source available
  useEffect(() => {
    if (mainUrl && mainRef.current) attachHls(mainRef.current, mainUrl)
  }, [mainUrl])

  useEffect(() => {
    if (loopUrl && loopRef.current) attachHls(loopRef.current, loopUrl)
  }, [loopUrl])

  // rAF loop: drift drives off MAIN video currentTime while we're in main phase.
  // When in loop phase, the last computed position persists on both elements.
  useEffect(() => {
    if (!isMobile) return
    const driftEndSec = introDriftEnd
    if (driftEndSec === null || driftEndSec <= 0) return

    let rafId: number
    const tick = () => {
      if (introPhase === 'main') {
        const vid = mainRef.current
        if (vid) {
          const ct = vid.currentTime
          const linear = Math.min(ct / driftEndSec, 1)
          const eased = linear * linear * linear
          const pos = lerpPosition(VIDEO_POSITIONS.intro.start, VIDEO_POSITIONS.intro.end, eased)
          vid.style.objectPosition = pos
          if (loopRef.current) loopRef.current.style.objectPosition = pos
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isMobile, introDriftEnd, introPhase])

  // Wait for prelude main element to have its first frame decoded.
  // Note: requestVideoFrameCallback does not fire on a paused element in Chrome,
  // so we gate on readyState >= 3 (HAVE_FUTURE_DATA) instead. We use setTimeout
  // rather than requestAnimationFrame so the wait still resolves when the tab
  // is backgrounded.
  const waitForVideoReady = (targetIdx: number, cb: () => void) => {
    const TIMEOUT = 1500
    const start = performance.now()
    const poll = () => {
      const el = document.querySelector<HTMLVideoElement>(`[data-module-video="${targetIdx}"]`)
      if (el && el.readyState >= 3) { cb(); return }
      if (performance.now() - start > TIMEOUT) { cb(); return }
      setTimeout(poll, 16)
    }
    poll()
  }

  const [instantCut, setInstantCut] = useState(false)

  const triggerPreludeTransition = () => {
    if (isClosingRef.current) return

    pendingPreludeRef.current = false
    setPendingPrelude(false)
    isClosingRef.current = true
    setIsClosing(true)

    try { mainRef.current?.pause() } catch {}
    try { loopRef.current?.pause() } catch {}

    const preludeMain = document.querySelector('video[data-module-video="0"][data-role="main"]') as HTMLVideoElement | null
    const loop = loopRef.current
    console.log('[prelude-cut loop-phase]', {
      ua: navigator.userAgent,
      preludeReadyState: preludeMain?.readyState,
      preludeCurrentTime: preludeMain?.currentTime,
      preludeBuffered: preludeMain && preludeMain.buffered.length ? `${preludeMain.buffered.start(0).toFixed(3)}–${preludeMain.buffered.end(0).toFixed(3)}` : 'none',
      preludePaused: preludeMain?.paused,
      loopCurrentTime: loop?.currentTime,
      loopDuration: loop?.duration,
      tMs: performance.now().toFixed(1),
    })

    dispatch({ type: 'SET_MODULE', payload: 0 })
    dispatch({ type: 'PLAY' })

    setInstantCut(true)
    setOverlayOpacity(0)

    requestAnimationFrame(() => {
      console.log('[prelude-cut +1raf]', {
        preludeReadyState: preludeMain?.readyState,
        preludeCurrentTime: preludeMain?.currentTime,
        preludePaused: preludeMain?.paused,
        tMs: performance.now().toFixed(1),
      })
    })
    setTimeout(() => {
      console.log('[prelude-cut +50ms]', {
        preludeReadyState: preludeMain?.readyState,
        preludeCurrentTime: preludeMain?.currentTime,
        preludePaused: preludeMain?.paused,
        tMs: performance.now().toFixed(1),
      })
    }, 50)
    setTimeout(onFinish, 550)
  }

  // Prelude request signal
  useLayoutEffect(() => {
    if (!videoState.pendingPreludeFromIntro || isClosingRef.current) return
    pendingPreludeRef.current = true
    setPendingPrelude(true)

    // In main phase: fade-to-black, then cut to prelude. Don't wait for the
    // intro main to finish playing on its own.
    if (introPhase === 'main') {
      isClosingRef.current = true
      setIsClosing(true)
      setBlackOverlay(true)
      setTimeout(() => {
        try { mainRef.current?.pause() } catch {}
        try { loopRef.current?.pause() } catch {}
        waitForVideoReady(0, () => {
          pendingPreludeRef.current = false
          setPendingPrelude(false)
          dispatch({ type: 'SET_PENDING_PRELUDE', payload: false })
          dispatch({ type: 'SET_MODULE', payload: 0 })
          dispatch({ type: 'PLAY' })
          setOverlayOpacity(0)
          setTimeout(onFinish, 400)
        })
      }, 350)
      return
    }

    // In loop phase: wait for the current cycle to finish so the cut lands on
    // the loop's last frame (authored to match prelude main frame 0).
    const loop = loopRef.current
    const dur = loop?.duration
    if (!loop || !dur || !isFinite(dur) || dur <= 0) {
      // Loop not ready / fallback — cut immediately
      triggerPreludeTransition()
      return
    }

    // Fire ~30ms before wrap so the visible frame is the last frame of this cycle,
    // not the first frame of the next iteration. Floor at 0.
    const remainingMs = Math.max((dur - loop.currentTime) * 1000 - 30, 0)
    const t = setTimeout(triggerPreludeTransition, remainingMs)
    return () => clearTimeout(t)
  }, [videoState.pendingPreludeFromIntro, introPhase])

  // Non-prelude module selected from intro → fade-to-black sequence
  useLayoutEffect(() => {
    if (videoState.currentModuleIndex < 0 || isClosingRef.current) return
    if (videoState.currentModuleIndex === 0) return

    pendingPreludeRef.current = false
    setPendingPrelude(false)
    dispatch({ type: 'SET_PENDING_PRELUDE', payload: false })
    isClosingRef.current = true
    setIsClosing(true)

    setBlackOverlay(true)

    const fadeToBlackMs = 350
    const t = setTimeout(() => {
      try { mainRef.current?.pause() } catch {}
      try { loopRef.current?.pause() } catch {}

      waitForVideoReady(videoState.currentModuleIndex, () => {
        dispatch({ type: 'PLAY' })
        setOverlayOpacity(0)
        setTimeout(onFinish, 400)
      })
    }, fadeToBlackMs)

    return () => clearTimeout(t)
  }, [videoState.currentModuleIndex])

  const handleMainCanPlay = () => {
    setIsVideoReady(true)
    window.dispatchEvent(new Event('intro-video-ready'))
    if (mainRef.current && introPhase === 'main') {
      mainRef.current.play().catch(() => {})
    }
  }

  const handleMainEnded = () => {
    // If user clicked prelude, fire the seamless transition at the natural end of main
    if (pendingPreludeRef.current) {
      triggerPreludeTransition()
      return
    }
    // Otherwise swap to the loop (instant)
    setIntroPhase('loop')
    if (loopRef.current) {
      try { loopRef.current.currentTime = 0 } catch {}
      loopRef.current.play().catch(() => {})
    }
  }

  const handleMainPause = () => {
    const vid = mainRef.current
    if (!vid || isClosingRef.current || introPhase !== 'main') return
    window.requestAnimationFrame(() => {
      if (vid && vid.paused && !isClosingRef.current && introPhase === 'main') {
        try { vid.play().catch(() => {}) } catch {}
      }
    })
  }

  const handleLoopPause = () => {
    const vid = loopRef.current
    if (!vid || isClosingRef.current || introPhase !== 'loop') return
    window.requestAnimationFrame(() => {
      if (vid && vid.paused && !isClosingRef.current && introPhase === 'loop') {
        try { vid.play().catch(() => {}) } catch {}
      }
    })
  }

  // Fallback for missing loop clip: if intro main ends with no loopUrl, hold the last frame
  // (pause is implicit). Button still appears once introPhase flips to 'loop'.
  useEffect(() => {
    if (introPhase === 'loop' && !loopUrl && mainRef.current) {
      try { mainRef.current.pause() } catch {}
    }
  }, [introPhase, loopUrl])

  const handleClick = () => {
    setShowLoading(true)
    playModule(0)
    const firstModule = modulesState.modules[0]
    if (firstModule?.slug?.current) {
      setModulePage(0, firstModule.slug.current)
    }
  }

  // Reset "Loading" label only after the button has finished fading out, so the
  // user never sees the label swap back to PRELUDE while visible.
  useEffect(() => {
    if (!showLoading) return
    if (buttonShouldShow) return
    const t = window.setTimeout(() => setShowLoading(false), 600)
    return () => window.clearTimeout(t)
  }, [showLoading, buttonShouldShow])

  // Opacity for the two video elements (intro main vs intro loop). When no loop clip is
  // provided we keep main visible during the loop phase as a static last-frame fallback.
  const mainOpacity = isVideoReady && (introPhase === 'main' || !loopUrl) ? 1 : 0
  const loopOpacity = introPhase === 'loop' && !!loopUrl ? 1 : 0

  return (
    <>
      <div
        className={`fixed top-0 left-0 h-full ${SIDEBAR_OFFSET_CLASS} z-[15] flex items-center justify-center`}
        style={{
          opacity: overlayOpacity,
          transition: instantCut ? 'none' : 'opacity 0.3s ease-in-out',
          pointerEvents: isClosing ? 'none' : 'auto',
        }}
      >
        {/* Video shift wrapper — mirrors VideoPlayerStacked for seamless prelude cut */}
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
        {mainUrl && (
          <video
            ref={mainRef}
            preload="auto"
            muted
            playsInline
            crossOrigin="anonymous"
            onCanPlay={handleMainCanPlay}
            onEnded={handleMainEnded}
            onPause={handleMainPause}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: mainOpacity,
              objectPosition: isMobile
                ? lerpPosition(VIDEO_POSITIONS.intro.start, VIDEO_POSITIONS.intro.end, 0)
                : '50% 50%',
              transition: 'none',
            }}
          />
        )}
        {loopUrl && (
          <video
            ref={loopRef}
            preload="auto"
            muted
            playsInline
            loop
            crossOrigin="anonymous"
            onPause={handleLoopPause}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: loopOpacity,
              objectPosition: isMobile
                ? lerpPosition(VIDEO_POSITIONS.intro.start, VIDEO_POSITIONS.intro.end, 1)
                : '50% 50%',
              transition: 'none',
            }}
          />
        )}

        <div
          className="absolute inset-0"
          style={{
            backgroundColor: 'black',
            opacity: blackOverlay ? 1 : 0,
            transition: 'opacity 0.3s ease-in-out',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        />

        {showDebug && (
          <div className="absolute top-2 left-2 z-50 bg-black/80 text-green-400 font-mono text-xs p-3 rounded pointer-events-none max-w-xs">
            <div className="font-bold text-white mb-1">IntroOverlay Debug</div>
            <div>introPhase: <span className="text-yellow-300">{introPhase}</span></div>
            <div>main.currentTime: {mainRef.current?.currentTime?.toFixed?.(2)}</div>
            <div>main.duration: {mainRef.current?.duration?.toFixed?.(2)}</div>
            <div>main.paused: {String(mainRef.current?.paused)}</div>
            <div>loop.currentTime: {loopRef.current?.currentTime?.toFixed?.(2)}</div>
            <div>loop.paused: {String(loopRef.current?.paused)}</div>
            <div>pendingPrelude: <span className="text-yellow-300">{String(pendingPrelude)}</span></div>
            <div>isClosing: {String(isClosing)}</div>
            <div>blackOverlay: {String(blackOverlay)}</div>
            <div>moduleIndex: {videoState.currentModuleIndex}</div>
          </div>
        )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleClick}
        className="fixed bg-black text-light font-serif font-normal text-xs tracking-wide uppercase border-light border hover:bg-light hover:text-black px-5 py-2 z-[41] w-36 text-center"
        style={{
          left: '50%',
          bottom: (() => {
            if (!isMobile) return '1rem'
            const stage = pageState.contentPanelStage
            const lift = stage === 'expanded' ? '70vh' : stage === 'peek' ? '4rem' : '0px'
            return `calc(115px + ${lift} + 0.5rem)`
          })(),
          transform: (() => {
            if (isMobile) return 'translateX(-50%)'
            const sidebarOffset = 0
            const panelOffset = isContentPanelExpanded ? 192 : 0
            return `translateX(calc(-50% - ${sidebarOffset + panelOffset}px))`
          })(),
          opacity: buttonShouldShow ? 1 : 0,
          transition: 'bottom 500ms cubic-bezier(0.4, 0, 0.2, 1), opacity 500ms cubic-bezier(0.4, 0, 0.2, 1)',
          pointerEvents: buttonShouldShow ? 'auto' : 'none',
        }}
      >
        {showLoading ? <>Loading<LoadingDots /></> : (buttonLabel || 'PRELUDE')}
      </button>
    </>
  )
}
