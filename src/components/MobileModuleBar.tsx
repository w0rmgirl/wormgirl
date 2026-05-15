'use client'

import { useModules } from '@/context/ModulesContext'
import { useVideo } from '@/context/VideoContext'
import { usePageState } from '@/context/PageStateContext'
import React, { useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { urlFor } from '@/lib/sanity'

// Helper function to convert number to Roman numeral
function toRomanNumeral(num: number): string {
  const romanNumerals = [
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' },
  ]

  let result = ''
  for (const { value, numeral } of romanNumerals) {
    while (num >= value) {
      result += numeral
      num -= value
    }
  }
  return result
}

export default function MobileModuleBar() {
  const containerRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const { state: modulesState } = useModules()
  const { playModule } = useVideo()
  const {
    state: pageState,
    closeTopMenu,
    setModulePage,
    collapseContentPanel,
  } = usePageState()

  // Scroll a tab into view by module index
  const scrollToTab = useCallback((index: number) => {
    const container = containerRef.current
    if (!container) return
    const button = container.children[index] as HTMLElement | undefined
    if (button) {
      container.scrollTo({ left: button.offsetLeft, behavior: 'smooth' })
    }
  }, [])

  // Listen for external scroll requests (e.g. from Next Chapter button)
  useEffect(() => {
    const handler = (e: Event) => {
      const idx = (e as CustomEvent).detail?.index
      if (typeof idx === 'number') scrollToTab(idx)
    }
    window.addEventListener('mobile-module-bar-scroll', handler)
    return () => window.removeEventListener('mobile-module-bar-scroll', handler)
  }, [scrollToTab])

  const handleModuleClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    index: number,
    slug: string
  ) => {
    // If top menu open, close it first and collapse content panel if needed
    if (pageState.isTopMenuOpen) {
      // When closing top menu, also collapse the bottom content panel if it's showing content
      if (pageState.currentPage === 'content' && pageState.contentPanelStage !== 'hidden') {
        collapseContentPanel()
      }
      closeTopMenu()
    }
    playModule(index)
    setModulePage(index, slug)

    // Snap selected tile to the left edge
    scrollToTab(index)
  }

  // Determine offset: when the content panel is peeking, move the bar up by the same amount (4rem).
  // When the panel is fully expanded we hide the bar off-screen so it doesn’t cover the panel.
  const barOffsetClass = (() => {
    // Slide only on module pages when top menu is not open
    if (pageState.isTopMenuOpen || pageState.currentPage !== 'module') return ''

    if (pageState.contentPanelStage === 'expanded') return '-translate-y-[70vh]' // Above expanded panel
    if (pageState.contentPanelStage === 'peek') return '-translate-y-16' // Align with peek (4rem)
    return ''
  })()

  // Dim when the top menu is open, but keep clickable
  const disabledStyle = pageState.isTopMenuOpen
    ? 'opacity-40'
    : ''

  // Match bar animation timing with content panel (slower when panel visible)
  const barDurationClass = 'duration-500'

  // Update CSS custom properties that expose the bar's height and its current
  // offset from the bottom of the viewport so other components (like the
  // Next Chapter button) can position themselves reliably.
  useLayoutEffect(() => {
    const computeTargetLiftPx = () => {
      // Mirrors barOffsetClass logic so the offset var reflects the bar's TARGET
      // position immediately on state change, not after the 500ms transitionend.
      if (pageState.isTopMenuOpen || pageState.currentPage !== 'module') return 0
      if (pageState.contentPanelStage === 'expanded') return window.innerHeight * 0.7
      if (pageState.contentPanelStage === 'peek') return 64 // 4rem
      return 0
    }

    const updateMetrics = () => {
      const el = barRef.current
      if (!el) return

      // Measure the bar's untranslated height. We can't trust getBoundingClientRect
      // mid-transition (it reflects an in-flight transform), so compute height from
      // offsetHeight (transform-free) and synthesize the offset from current state.
      const height = el.offsetHeight || 80
      document.documentElement.style.setProperty('--mobile-module-bar-height', `${height}px`)

      const lift = computeTargetLiftPx()
      document.documentElement.style.setProperty('--mobile-module-bar-offset', `${height + lift}px`)
    }

    updateMetrics()

          // Schedule extra measurements after initial load
          setTimeout(updateMetrics, 0)
          requestAnimationFrame(() => requestAnimationFrame(updateMetrics))
          setTimeout(updateMetrics, 300)

          window.addEventListener('resize', updateMetrics)
      window.addEventListener('orientationchange', updateMetrics)
      // Safari iOS hides/shows its browser chrome when scrolling which changes the viewport height
      window.addEventListener('scroll', updateMetrics)

    // Update again when the bar's slide animation completes so the offset reflects
    // the final position (initial measurement can be early while the transition is in progress).
    const el = barRef.current
    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'transform') {
        updateMetrics()
      }
    }

    if (el) {
      el.addEventListener('transitionend', handleTransitionEnd)
    }

    return () => {
      window.removeEventListener('resize', updateMetrics)
      window.removeEventListener('orientationchange', updateMetrics)
      window.removeEventListener('scroll', updateMetrics)

      if (el) {
        el.removeEventListener('transitionend', handleTransitionEnd)
      }
    }
  }, [pageState.contentPanelStage, pageState.isTopMenuOpen, pageState.currentPage])

  return modulesState.loading ? null : (
    <div
      ref={barRef}
      id="mobile-module-bar"
      className={`md:hidden fixed bottom-0 left-0 right-0 z-40 transition-transform ${barDurationClass} bg-dark ${barOffsetClass}`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
      onClick={() => {
        if (pageState.isTopMenuOpen) {
          // When closing top menu, also collapse the bottom content panel if it's showing content
          if (pageState.currentPage === 'content' && pageState.contentPanelStage !== 'hidden') {
            collapseContentPanel()
          }
          closeTopMenu()
        }
      }}
    >
      <div
        ref={containerRef}
        className={`flex overflow-x-auto overscroll-x-contain snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${disabledStyle}`}
      >
        {modulesState.modules.map((module, index) => {
          const isActive =
            pageState.currentPage === 'module' &&
            pageState.previousModuleIndex === index
          const isFirst = index === 0
          const isLast = index === modulesState.modules.length - 1

          // Border logic: only top, bottom, and left borders; remove left on first, right on last
          const borderClasses = `${isFirst ? 'border-l-0' : 'border-l'} ${
            isLast ? 'border-r-0' : ''
          } border-y border-light`

          return (
            <button
              key={module._id}
              onClick={(e) => handleModuleClick(e, index, module.slug.current)}
              className={`relative group flex-shrink-0 w-44 snap-start text-left p-0 transition-colors ${
                isActive ? 'bg-light text-dark' : 'text-light [@media(hover:hover)]:hover:bg-light [@media(hover:hover)]:hover:text-primary'
              } ${borderClasses}`}
            >
              {/* Background SVG overlay for selected state */}
              {isActive && module.tabImage && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    WebkitMaskImage: `url(${urlFor(module.tabImage).width(400).url()})`,
                    maskImage: `url(${urlFor(module.tabImage).width(400).url()})`,
                    WebkitMaskSize: 'cover',
                    maskSize: 'cover',
                    backgroundColor: 'var(--dark)',
                  }}
                />
              )}

              {/* Background SVG overlay for hover state */}
              {!isActive && module.tabImage && (
                <div
                  className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-100"
                  style={{
                    WebkitMaskImage: `url(${urlFor(module.tabImage).width(400).url()})`,
                    maskImage: `url(${urlFor(module.tabImage).width(400).url()})`,
                    WebkitMaskSize: 'cover',
                    maskSize: 'cover',
                    backgroundColor: 'var(--dark)',
                  }}
                />
              )}
              <div className="flex flex-col h-full p-3 pb-6 justify-start">
                <div
                  className={`w-7 justify-center text-xl leading-tight font-serif font-normal ${
                    isActive ? 'text-dark' : 'text-light [@media(hover:hover)]:group-hover:text-dark'
                  }`}
                >
                  {index === 0 ? '—' : toRomanNumeral(module.order)}
                </div>
                {index !== 0 && module.timeline && (
                  <p className="text-sm font-normal font-sc tracking-wide lowercase">
                    {module.timeline}
                  </p>
                )}
                <div className="flex-1">
                  <p className="font-serif font-normal text-xs tracking-wide uppercase">{module.title}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}