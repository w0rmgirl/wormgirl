'use client'

import { usePageState } from '@/context/PageStateContext'
import { useRef, useState, useEffect } from 'react'
import { useContentPages } from '@/context/ContentPagesContext'
import { urlFor, type SanityAboutPage, type SanityLibraryPage } from '@/lib/sanity'
import { PortableText } from '@portabletext/react'
import Image from 'next/image'

export default function MobileTopMenu() {
  const containerRef = useRef<HTMLDivElement>(null)
  const topMenuRef = useRef<HTMLDivElement>(null)
  const closeBarRef = useRef<HTMLDivElement>(null)
  const menuOptionsRef = useRef<HTMLDivElement>(null)
  const contentScrollRef = useRef<HTMLDivElement>(null)
  
  const {
    state: pageState,
    toggleTopMenu,
    closeTopMenu,
    collapseContentPanel,
  } = usePageState()

  const { state: contentPagesState, getPageBySlug } = useContentPages()
  
  // Local state for mobile top menu content - doesn't affect global page state
  const [selectedMenuTab, setSelectedMenuTab] = useState<string | null>(null)
  const [contentPanelHeight, setContentPanelHeight] = useState<string>('60vh')

  // Reset selected tab when menu closes
  useEffect(() => {
    if (!pageState.isTopMenuOpen) {
      setSelectedMenuTab(null)
    }
  }, [pageState.isTopMenuOpen])

  // Reset scroll position when switching tabs
  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [selectedMenuTab])

  // Calculate dynamic height based on actual rendered elements
  useEffect(() => {
    if (!pageState.isTopMenuOpen) return

    const calculateHeight = () => {
      const closeBarHeight = closeBarRef.current?.offsetHeight || 0
      const menuOptionsHeight = menuOptionsRef.current?.offsetHeight || 0
      const moduleBarElement = document.getElementById('mobile-module-bar')
      const moduleBarHeight = moduleBarElement?.offsetHeight || 0
      
      const totalReservedHeight = closeBarHeight + menuOptionsHeight + moduleBarHeight
      const availableHeight = window.innerHeight - totalReservedHeight
      
      setContentPanelHeight(`${availableHeight}px`)
    }

    // Calculate after elements are rendered
    const timer = setTimeout(calculateHeight, 100)
    
    // Recalculate on resize
    const handleResize = () => calculateHeight()
    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [pageState.isTopMenuOpen, selectedMenuTab])

  const contentPages = contentPagesState.pages

  const handlePageClick = (
    e: React.MouseEvent<HTMLButtonElement>,
    slug: string
  ) => {
    // Use local state instead of global state to avoid affecting bottom content panel
    setSelectedMenuTab(slug)
    // Don't call closeTopMenu() or setCurrentPage() - keep menu open and don't affect global state
    
    // Snap selected tab to the left edge
    if (containerRef.current) {
      const button = e.currentTarget as HTMLButtonElement
      const container = containerRef.current
      container.scrollTo({ left: button.offsetLeft, behavior: 'smooth' })
    }
  }

  const portableTextComponents = {
    block: {
      normal: ({children}: any) => <p className="leading-normal mb-4 text-light">{children}</p>,
      h1: ({children}: any) => <h1 className="text-lg font-bold mb-3 text-light">{children}</h1>,
      h2: ({children}: any) => <h2 className="text-base font-semibold mb-2 text-light">{children}</h2>,
      h3: ({children}: any) => <h3 className="text-sm font-semibold mb-2 text-light">{children}</h3>,
    },
    list: {
      bullet: ({children}: any) => <ul className="text-sm space-y-1 mb-4 custom-bullet-list text-light">{children}</ul>,
      number: ({children}: any) => <ol className="text-sm space-y-1 mb-4 list-decimal list-inside text-light">{children}</ol>,
    },
    listItem: {
      bullet: ({children}: any) => <li className="text-light">{children}</li>,
      number: ({children}: any) => <li className="text-light">{children}</li>,
    },
    marks: {
      strong: ({children}: any) => <strong className="font-bold text-light">{children}</strong>,
      em: ({children}: any) => <em className="italic text-light">{children}</em>,
      smallCaps: ({children}: any) => <span className="font-sc text-light">{children}</span>,
      link: ({children, value}: any) => (
        <a href={value?.href} className="text-light underline hover:text-primary" target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
    },
    types: {
      image: ({ value }: { value: any }) => {
        let origW: number | undefined = value?.asset?.metadata?.dimensions?.width
        let origH: number | undefined = value?.asset?.metadata?.dimensions?.height

        if (!origW || !origH) {
          const ref: string | undefined = value?.asset?._ref
          const match = ref?.match(/-(\d+)x(\d+)-/)
          if (match) {
            origW = parseInt(match[1], 10)
            origH = parseInt(match[2], 10)
          }
        }

        origW = origW || 800
        origH = origH || 600

        return (
          <div className="mb-6 mx-auto text-center">
            <img
              src={urlFor(value).width(600).quality(80).url()}
              alt={value.alt || ''}
              className="max-w-full h-auto block mx-auto"
              loading="lazy"
              style={{ aspectRatio: `${origW}/${origH}`, margin: 0, padding: 0 }}
            />
            {value.caption && (
              <p className="text-xs italic mt-6 text-light text-left" style={{fontFamily: 'Baskervville'}}>{value.caption}</p>
            )}
          </div>
        )
      },
      spotifyEmbed: ({ value }: { value: { url: string; height?: number } }) => {
        if (!value?.url) return null

        const embedUrl = value.url.replace('open.spotify.com/', 'open.spotify.com/embed/')
        const height = value.height || 380

        return (
          <div className="my-6">
            <iframe 
              src={embedUrl}
              width="100%"
              height={height}
              frameBorder="0"
              allowTransparency={true}
              allow="encrypted-media"
              loading="lazy"
              className="rounded-lg"
            />
          </div>
        )
      },
    },
  }

  // Separate components for content pages with tighter spacing and smaller text
  const contentPageTextComponents = {
    block: {
      normal: ({children}: any) => <p className="text-xs leading-tight mb-0 text-light">{children}</p>,
      h1: ({children}: any) => <h1 className="text-sm font-bold mb-2 text-light">{children}</h1>,
      h2: ({children}: any) => <h2 className="text-xs font-semibold mb-1 text-light">{children}</h2>,
      h3: ({children}: any) => <h3 className="text-xs mb-1 font-sc mb-0 text-light">{children}</h3>,
      blockquote: ({children}: any) => <blockquote className="font-mono text-[0.55rem] leading-normal text-light my-4 border-l-0 pl-6">{children}</blockquote>,
      indent: ({children}: any) => <p className="text-xs leading-tight mb-0 text-light pl-6">{children}</p>,
      quote2: ({children}: any) => <p className="text-[0.65rem] italic leading-tight mb-0 text-light pl-6">{children}</p>,
    },
    list: {
      bullet: ({children}: any) => <ul className="text-xs space-y-0 mb-2 custom-bullet-list text-light">{children}</ul>,
      number: ({children}: any) => <ol className="text-xs space-y-0 mb-2 list-decimal list-inside text-light">{children}</ol>,
    },
    listItem: {
      bullet: ({children}: any) => <li className="text-light leading-tight">{children}</li>,
      number: ({children}: any) => <li className="text-light leading-tight">{children}</li>,
    },
    marks: {
      strong: ({children}: any) => <strong className="font-bold text-light">{children}</strong>,
      em: ({children}: any) => <em className="italic text-light">{children}</em>,
      smallCaps: ({children}: any) => <span className="font-sc text-light">{children}</span>,
      link: ({children, value}: any) => (
        <a href={value?.href} className="text-light underline hover:text-primary" target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
    },
    types: {
      image: ({ value }: { value: any }) => {
        let origW: number | undefined = value?.asset?.metadata?.dimensions?.width
        let origH: number | undefined = value?.asset?.metadata?.dimensions?.height

        if (!origW || !origH) {
          const ref: string | undefined = value?.asset?._ref
          const match = ref?.match(/-(\d+)x(\d+)-/)
          if (match) {
            origW = parseInt(match[1], 10)
            origH = parseInt(match[2], 10)
          }
        }

        origW = origW || 800
        origH = origH || 600

        return (
          <div className="mb-4 mx-auto text-center">
            <img
              src={urlFor(value).width(600).quality(80).url()}
              alt={value.alt || ''}
              className="max-w-full h-auto block mx-auto"
              loading="lazy"
              style={{ aspectRatio: `${origW}/${origH}`, margin: 0, padding: 0 }}
            />
            {value.caption && (
              <p className="text-xs italic mt-1 text-light text-left" style={{fontFamily: 'Baskervville'}}>{value.caption}</p>
            )}
          </div>
        )
      },
      spotifyEmbed: ({ value }: { value: { url: string; height?: number } }) => {
        if (!value?.url) return null

        const embedUrl = value.url.replace('open.spotify.com/', 'open.spotify.com/embed/')
        const height = value.height || 380

        return (
          <div className="my-4">
            <iframe 
              src={embedUrl}
              width="100%"
              height={height}
              frameBorder="0"
              allowTransparency={true}
              allow="encrypted-media"
              loading="lazy"
              className="rounded-lg"
            />
          </div>
        )
      },
    },
  }

  const renderTopMenuContent = () => {
    // Only render content when a menu tab is selected and top menu is open
    if (!selectedMenuTab || !pageState.isTopMenuOpen) {
      return null
    }

    if (contentPagesState.loading) {
      return (
        <div className="bg-black" style={{ height: contentPanelHeight }}>
          <div className="p-6">
            <div className="text-center text-muted">
              Loading page content...
            </div>
          </div>
        </div>
      )
    }

    const currentPageData = selectedMenuTab ? getPageBySlug(selectedMenuTab) : null
    
    if (!currentPageData) {
      return (
        <div className="bg-black" style={{ height: contentPanelHeight }}>
          <div className="p-6">
            <div className="text-center text-muted">
              <p className="text-sm">Page not found</p>
              <p className="text-xs mt-2">No content available for {selectedMenuTab}</p>
            </div>
          </div>
        </div>
      )
    }

    // Render based on page type
    switch (currentPageData._type) {
      case 'aboutPage':
        return (
          <div ref={contentScrollRef} className="bg-black overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ height: contentPanelHeight }}>
            <div className="p-4 pb-6">
              <div className="prose-custom">
                {(currentPageData as SanityAboutPage).content && (
                  <PortableText 
                    value={(currentPageData as SanityAboutPage).content} 
                    components={contentPageTextComponents} 
                  />
                )}
              </div>
            </div>
          </div>
        )

      case 'libraryPage': {
        const libraryPage = currentPageData as SanityLibraryPage
        return (
          <div ref={contentScrollRef} className="bg-black overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ height: contentPanelHeight }}>
            <div className="p-4 pb-6">
              {libraryPage.description && (
                <div className="prose-custom mb-8">
                  <PortableText 
                    value={libraryPage.description} 
                    components={contentPageTextComponents} 
                  />
                </div>
              )}
              {libraryPage.sound && libraryPage.sound.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-normal uppercase mb-4 text-light">Sound</h2>
                  <ul>
                    {libraryPage.sound.map((ref, index) => (
                      <li key={index} className="border-t border-light py-2 last:border-b">
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-baseline text-light hover:text-muted transition-colors"
                        >
                          <span className="text-sm font-mono mr-4">{String(index + 1).padStart(3, '0')}</span>
                          <span className="text-sm">{ref.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {libraryPage.books && libraryPage.books.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-normal uppercase mb-4 text-light">Books</h2>
                  <ul>
                    {libraryPage.books.map((ref, index) => (
                      <li key={index} className="border-t border-light py-2 last:border-b">
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-baseline text-light hover:text-muted transition-colors"
                        >
                          <span className="text-sm font-mono mr-4">{String(index + 1).padStart(3, '0')}</span>
                          <span className="text-sm">{ref.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )
      }

      default:
        return (
          <div ref={contentScrollRef} className="bg-black overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ height: contentPanelHeight }}>
            <div className="p-6">
              <div className="text-center text-muted">
                <p className="text-sm">Unsupported page type: {(currentPageData as any)._type}</p>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <>
      {/* MENU button shown when the top menu is closed */}
      {!pageState.isTopMenuOpen && (
        <button
          onClick={toggleTopMenu}
          className="md:hidden fixed top-3 left-3 z-50 text-light text-xs uppercase tracking-widest font-serif font-extrabold"
        >
          MENU
        </button>
      )}

      {/* Top menu, only rendered when open */}
      {pageState.isTopMenuOpen && (
        <div ref={topMenuRef} className="md:hidden fixed top-0 left-0 right-0 z-50 flex flex-col" style={{ bottom: 'var(--mobile-module-bar-height, 0px)' }}>
          {/* Close bar */}
          <div ref={closeBarRef} className="relative flex items-center bg-dark border-b border-light p-3 flex-shrink-0">
            <button
              onClick={() => {
                // When closing top menu, also collapse the bottom content panel if it's showing content
                if (pageState.currentPage === 'content' && pageState.contentPanelStage !== 'hidden') {
                  collapseContentPanel()
                }
                toggleTopMenu()
              }}
              className="text-light text-xs font-serif uppercase tracking-widest font-extrabold"
            >
              × Close
            </button>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Image
                src="/WORMGIRL_TEXT_LOGO_FINAL.svg"
                alt="Worm Girl"
                width={120}
                height={24}
                className="h-3.5 w-auto"
              />
            </div>
          </div>

          {/* Menu options - tab style like module bar */}
          <div ref={menuOptionsRef} className="bg-black border-b border-light w-full flex-shrink-0">
            <div
              ref={containerRef}
              className="flex overflow-x-auto overscroll-x-contain snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            >
              {contentPages.map((page, index) => {
                const isActive = selectedMenuTab === page.slug?.current
                const isFirst = index === 0
                const isLast = index === contentPages.length - 1

                // Border logic: only top, bottom, and left borders; remove left on first, right on last
                const borderClasses = `${isFirst ? 'border-l-0' : 'border-l'} ${
                  isLast ? 'border-r-0' : ''
                } border-light`

                return (
                  <button
                    key={page.slug?.current || page._id}
                    onClick={(e) => handlePageClick(e, page.slug?.current || page._id)}
                    className={`group flex-1 text-center p-0 transition-colors ${
                      isActive ? 'bg-light text-dark' : 'hover:bg-light hover:text-primary'
                    } ${borderClasses}`}
                  >
                    <div className="flex items-center justify-center py-2 px-3">
                      <p className="font-serif font-normal text-xs tracking-wide uppercase">{page.title}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Content area that appears below menu options */}
          {renderTopMenuContent()}
        </div>
      )}
    </>
  )
} 