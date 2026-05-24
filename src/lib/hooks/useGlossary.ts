import { useRef, useEffect, useMemo, useCallback, useState } from 'react'

interface GlossaryTerm {
  id: string
  term: string
  definition: any[] // Portable text content
}

export function useGlossary(glossaryTerms: any[] = [], isMobile: boolean = false) {
  const glossaryRefsRef = useRef<Set<string>>(new Set())
  
  // Track which glossary term is currently highlighted
  const [highlightedGlossaryId, setHighlightedGlossaryId] = useState<string | null>(null)
  
  // Create glossary terms mapping
  const glossaryMap = useMemo(() => {
    const map = new Map<string, GlossaryTerm>()
    
    glossaryTerms.forEach((term) => {
      if (term.id) {
        map.set(term.id, {
          id: term.id,
          term: term.term,
          definition: term.definition
        })
      }
    })
    
    return map
  }, [glossaryTerms])

  // Helper: resolve the active content-scroll element with measurable height
  const getScrollContainer = (): HTMLElement | null => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('.content-scroll'))
    return (
      candidates.find((el) => el.clientHeight > 0 && el.scrollHeight > el.clientHeight) ||
      candidates.find((el) => el.clientHeight > 0) ||
      candidates[0] ||
      null
    )
  }
  
  // Register a glossary reference when it appears in the text
  const registerGlossaryRef = (glossaryId: string) => {
    glossaryRefsRef.current.add(glossaryId)
    return glossaryMap.get(glossaryId)?.term || '?'
  }
  
  // Get all referenced glossary terms in order of appearance
  const getReferencedGlossaryTerms = () => {
    return Array.from(glossaryRefsRef.current)
      .map(id => glossaryMap.get(id))
      .filter(Boolean) as GlossaryTerm[]
  }
  
  // Shared function to highlight all instances of a glossary term using React state
  const globalHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const highlightAllGlossaryInstances = useCallback((glossaryId: string) => {
    // Clear any existing timeout
    if (globalHighlightTimeoutRef.current) {
      clearTimeout(globalHighlightTimeoutRef.current)
    }
    
    // Set highlighted
    setHighlightedGlossaryId(glossaryId)
    
    // After 2 seconds, instantly remove highlight
    globalHighlightTimeoutRef.current = setTimeout(() => {
      setHighlightedGlossaryId(null)
      globalHighlightTimeoutRef.current = null
    }, 2000)
    
    return true
  }, [])
  
  // Scroll to glossary term (memoized to prevent re-renders)
  const scrollToGlossaryTerm = useCallback((glossaryId: string) => {
    const attemptScroll = (attempt = 0) => {
      const element = document.getElementById(`glossary-${glossaryId}`)
      if (element) {
        const container = getScrollContainer()
        if (container) {
          const offsetTop = element.getBoundingClientRect().top - container.getBoundingClientRect().top
          const target = container.scrollTop + offsetTop - 36
          const max = container.scrollHeight - container.clientHeight
          const clamped = Math.max(0, Math.min(target, max))
          
          // Detect when scroll actually completes
          let lastScrollTop = container.scrollTop
          let scrollCheckCount = 0
          const maxChecks = 60
          
          const checkScrollComplete = () => {
            scrollCheckCount++
            const currentScrollTop = container.scrollTop
            const reachedTarget = Math.abs(currentScrollTop - clamped) < 1
            const stoppedMoving = Math.abs(currentScrollTop - lastScrollTop) < 0.5
            
            if (reachedTarget || stoppedMoving || scrollCheckCount >= maxChecks) {
              highlightAllGlossaryInstances(glossaryId)
            } else {
              lastScrollTop = currentScrollTop
              setTimeout(checkScrollComplete, 50)
            }
          }
          
          container.scrollTo({ top: clamped, behavior: 'smooth' })
          setTimeout(checkScrollComplete, 100)
        } else {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          setTimeout(() => {
            highlightAllGlossaryInstances(glossaryId)
          }, 600)
        }
      } else if (attempt < 5) {
        requestAnimationFrame(() => attemptScroll(attempt + 1))
      }
    }

    attemptScroll()
  }, [highlightAllGlossaryInstances])
  
  const scrollToGlossaryReference = useCallback((glossaryId: string) => {
    const attemptScroll = (attempt = 0) => {
      const element = document.getElementById(`glossary-ref-${glossaryId}`)
      if (element) {
        const container = getScrollContainer()
        if (container) {
          const offsetTop = element.getBoundingClientRect().top - container.getBoundingClientRect().top
          const target = container.scrollTop + offsetTop - 36
          const max = container.scrollHeight - container.clientHeight
          const clamped = Math.max(0, Math.min(target, max))
          
          // Detect when scroll actually completes
          let lastScrollTop = container.scrollTop
          let scrollCheckCount = 0
          const maxChecks = 60
          
          const checkScrollComplete = () => {
            scrollCheckCount++
            const currentScrollTop = container.scrollTop
            const reachedTarget = Math.abs(currentScrollTop - clamped) < 1
            const stoppedMoving = Math.abs(currentScrollTop - lastScrollTop) < 0.5
            
            if (reachedTarget || stoppedMoving || scrollCheckCount >= maxChecks) {
              highlightAllGlossaryInstances(glossaryId)
            } else {
              lastScrollTop = currentScrollTop
              setTimeout(checkScrollComplete, 50)
            }
          }
          
          container.scrollTo({ top: clamped, behavior: 'smooth' })
          setTimeout(checkScrollComplete, 100)
        } else {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          setTimeout(() => {
            highlightAllGlossaryInstances(glossaryId)
          }, 600)
        }
      } else if (attempt < 5) {
        requestAnimationFrame(() => attemptScroll(attempt + 1))
      }
    }

    attemptScroll()
  }, [highlightAllGlossaryInstances])
  
  // Reset glossary refs when module changes
  useEffect(() => {
    glossaryRefsRef.current.clear()
  }, [glossaryTerms])
  
  return {
    registerGlossaryRef,
    getReferencedGlossaryTerms,
    scrollToGlossaryTerm,
    scrollToGlossaryReference,
    glossaryMap,
    highlightedGlossaryId
  }
}
