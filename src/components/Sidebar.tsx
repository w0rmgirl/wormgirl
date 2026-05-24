'use client'

import { useState, useEffect } from 'react'
import { useVideo } from '@/context/VideoContext'
import { usePageState } from '@/context/PageStateContext'
import { useModules } from '@/context/ModulesContext'
import { useContentPages } from '@/context/ContentPagesContext'
import { urlFor } from '@/lib/sanity'

// Helper function to convert number to Roman numeral
function toRomanNumeral(num: number): string {
  const romanNumerals = [
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' }
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

export default function Sidebar() {
  const { state: videoState, playModule } = useVideo()
  const { state: pageState, setCurrentPage, setModulePage, expandContentPanel } = usePageState()
  const { state: modulesState } = useModules()
  const { state: pagesState } = useContentPages()
  const contentPages = pagesState.pages

  const handleModuleClick = (index: number, slug: string) => {
    playModule(index)
    setModulePage(index, slug)
  }

  const handleContentPageClick = (slug: string) => {
    setCurrentPage(slug)
  }

  return (
    <div className="h-full flex flex-col bg-dark text-light">

      {/* Navigation */}
      <div className="flex flex-col overflow-y-auto min-h-0 flex-1 w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Logo */}
        <div className="px-2 py-3 border-b border-light">
          <div className="flex justify-center">
            <img src="/WORMGIRL_TEXT_LOGO_FINAL.svg" alt="Worm Girl" className="" />
          </div>
        </div>

        {/* Educational Modules */}
        <div className="p-0 flex-1">
          <div className="space-y-0">
            {modulesState.loading ? (
              <div className="p-3 text-center text-muted text-sm">
                Loading modules...
              </div>
            ) : modulesState.modules.length === 0 ? (
              <div className="p-3 text-center text-muted text-sm">
                No modules found
              </div>
            ) : (
              modulesState.modules.map((module, index) => {
                const selectedIndex = pageState.previousModuleIndex !== null ? pageState.previousModuleIndex : videoState.currentModuleIndex
                const isActive = pageState.currentPage === 'module' && selectedIndex === index

                return (
                  <button
                    key={module._id}
                    onClick={() => handleModuleClick(index, module.slug.current)}
                    className={`relative group w-full text-left p-0 transition-colors ${
                      isActive ? 'bg-light text-dark' : 'hover:bg-light hover:text-primary'
                    }`}
                  >
                    {/* Background SVG overlay for selected */}
                    {isActive && module.tabImage && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          WebkitMaskImage: `url(${urlFor(module.tabImage).width(400).url()})`,
                          maskImage: `url(${urlFor(module.tabImage).width(400).url()})`,
                          WebkitMaskSize: 'cover',
                          maskSize: 'cover',
                          backgroundColor: 'var(--dark)'
                        }}
                      />
                    )}

                    {/* Background SVG overlay for hover */}
                    {!isActive && module.tabImage && (
                      <div
                        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                        style={{
                          WebkitMaskImage: `url(${urlFor(module.tabImage).width(400).url()})`,
                          maskImage: `url(${urlFor(module.tabImage).width(400).url()})`,
                          WebkitMaskSize: 'cover',
                          maskSize: 'cover',
                          backgroundColor: 'var(--dark)'
                        }}
                      />
                    )}
                    <div className="flex flex-col p-3 pb-6 justify-start border-b border-light">
                      <div className={`w-7 justify-center text-xl leading-tight font-serif font-normal ${
                        isActive ? 'text-dark' : 'text-light group-hover:text-dark'
                      }`}>
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
              })
            )}
          </div>
        </div>

        {/* Bottom section with content pages */}
        <div className="mt-auto">
          {/* Content Pages */}
          <div className="p-0 ">
            <div className="border-b border-light">
              {contentPages.map((page) => (
                  <button
                    key={page._id}
                    onClick={() => handleContentPageClick(page.slug.current)}
                    className={`group w-full text-left px-3 py-1.5 border-t border-light first:border-t-0 hover:bg-light hover:text-dark ${pageState.currentPage === 'content' && pageState.currentPageSlug === page.slug.current ? 'bg-light text-dark' : ''}`}
                  >
                  <p className="font-serif font-normal text-xs tracking-wide uppercase">{page.title}</p>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-3 py-1 text-xs font-normal font-sc tracking-wide lowercase text-muted">
              <span className="text-[0.5rem]" style={{fontVariant: 'normal'}}>©</span> {new Date().getFullYear()} Worm Girl
            </div>
          </div>
        </div>

      </div>


    </div>
  )
} 