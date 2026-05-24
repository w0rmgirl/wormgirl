import { useRef, useEffect, useMemo, useCallback, useState } from 'react'

interface Footnote {
  id: string
  content: any[] // Portable text content
  number: number
}

export function useFootnotes(footnotes: any[] = [], isMobile: boolean = false) {
  // Track which footnote IDs have appeared in the rich-text so we can order definitions later.
  const footnoteRefsRef = useRef<Set<string>>(new Set())
  
  // Track which footnote is currently highlighted
  const [highlightedFootnoteId, setHighlightedFootnoteId] = useState<string | null>(null)
  
  // Create numbered footnotes mapping
  const footnotesMap = useMemo(() => {
    const map = new Map<string, Footnote>()
    
    footnotes.forEach((footnote, index) => {
      if (footnote.id) {
        map.set(footnote.id, {
          id: footnote.id,
          content: footnote.content,
          number: index + 1
        })
      }
    })
    
    return map
  }, [footnotes])

  // Helper: find the currently mounted scroll container with height > 0
  const getScrollContainer = (): HTMLElement | null => {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('.content-scroll'))
    return (
      candidates.find((el) => el.clientHeight > 0 && el.scrollHeight > el.clientHeight) ||
      candidates.find((el) => el.clientHeight > 0) ||
      candidates[0] ||
      null
    )
  }
  
  // Register a footnote reference when it appears in the text
  const registerFootnoteRef = (footnoteId: string) => {
    footnoteRefsRef.current.add(footnoteId)
    return footnotesMap.get(footnoteId)?.number || '?'
  }
  
  // Get all referenced footnotes in order of appearance
  const getReferencedFootnotes = () => {
    return Array.from(footnoteRefsRef.current)
      .map(id => footnotesMap.get(id))
      .filter(Boolean) as Footnote[]
  }
  
  // Shared function to highlight all instances of a footnote using React state
  const globalHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  const highlightAllFootnoteInstances = useCallback((footnoteId: string) => {
    // Clear any existing timeout
    if (globalHighlightTimeoutRef.current) {
      clearTimeout(globalHighlightTimeoutRef.current)
    }
    
    // Set highlighted
    setHighlightedFootnoteId(footnoteId)
    
    // After 2 seconds, instantly remove highlight
    globalHighlightTimeoutRef.current = setTimeout(() => {
      setHighlightedFootnoteId(null)
      globalHighlightTimeoutRef.current = null
    }, 2000)
    
    return true
  }, [])
  
  // Scroll to footnote (memoized to prevent re-renders)
  const scrollToFootnote = useCallback((footnoteId: string) => {
    const attemptScroll = (attempt = 0) => {
      const element = document.getElementById(`footnote-${footnoteId}`)
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
              highlightAllFootnoteInstances(footnoteId)
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
            highlightAllFootnoteInstances(footnoteId)
          }, 600)
        }
      } else if (attempt < 5) {
        requestAnimationFrame(() => attemptScroll(attempt + 1))
      }
    }

    attemptScroll()
  }, [highlightAllFootnoteInstances])

  // Scroll back to footnote reference
  const scrollToReference = useCallback((footnoteId: string) => {
    const attemptScroll = (attempt = 0) => {
      const element = document.getElementById(`footnote-ref-${footnoteId}`)
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
              highlightAllFootnoteInstances(footnoteId)
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
            highlightAllFootnoteInstances(footnoteId)
          }, 600)
        }
      } else if (attempt < 5) {
        requestAnimationFrame(() => attemptScroll(attempt + 1))
      }
    }

    attemptScroll()
  }, [highlightAllFootnoteInstances])

  // Reset footnote refs when module changes
  useEffect(() => {
    // When the module (and thus footnotes array) changes we reset the seen-refs set
    footnoteRefsRef.current.clear()
  }, [footnotes])
  
  return {
    registerFootnoteRef,
    getReferencedFootnotes,
    scrollToFootnote,
    scrollToReference,
    footnotesMap,
    highlightedFootnoteId
  }
} 