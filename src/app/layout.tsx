'use client'

import './globals.css'
import React from 'react'
import { VideoProvider } from '@/context/VideoContext'
import { PageStateProvider } from '@/context/PageStateContext'
import { ModulesProvider } from '@/context/ModulesContext'
import { ContentPagesProvider } from '@/context/ContentPagesContext'
import { usePageState } from '@/context/PageStateContext'
import VideoPlayerStacked from '@/components/VideoPlayerStacked'
import IntroOverlay from '@/components/IntroOverlay'
import Sidebar from '@/components/Sidebar'
import ContentPanel from '@/components/ContentPanel'
import MobileTopMenu from '@/components/MobileTopMenu'
import MobileModuleBar from '@/components/MobileModuleBar'
import { useModules } from '@/context/ModulesContext'
import { useVideo } from '@/context/VideoContext'
import PreLoader from '@/components/PreLoader'
import { usePathname } from 'next/navigation'
// No persistence – intro overlay resets on each page load

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isStudio = pathname.startsWith('/studio')
  const [introDone, setIntroDone] = React.useState(false)

  const handleIntroFinish = () => {
    setIntroDone(true)
  }

  // Studio route — render children only, no app UI
  if (isStudio) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    )
  }

  return (
    <html lang="en">
      <body className="font-serif overflow-hidden">
        <PreLoader />
        <ContentPagesProvider>
          <ModulesProvider>
            <VideoProvider>
              <PageStateProvider>
                <LayoutContent>
                  {children}
                </LayoutContent>
                {!introDone && <IntroOverlay onFinish={handleIntroFinish} />}
              </PageStateProvider>
            </VideoProvider>
          </ModulesProvider>
        </ContentPagesProvider>
      </body>
    </html>
  )
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { state: pageState } = usePageState()
  const isPanelVisibleDesktop = pageState.contentPanelStage !== 'hidden'
  const { state: modulesState } = useModules()
  const { state: videoState, dispatch: videoDispatch } = useVideo()

  // Calculate sidebar offset as a translateX value so it animates on the
  // compositor (same pipeline as the content panel's transform), preventing
  // the gap that appears when mixing layout-based `right` with `transform`.
  const getSidebarTranslateX = () => {
    if (!isPanelVisibleDesktop) return 'translateX(0)'
    // Use 80vw when maximized, otherwise 384px (w-96)
    return pageState.isPanelMaximized ? 'translateX(-80vw)' : 'translateX(-384px)'
  }

  // No automatic Prelude start – handled by user click

  return (
    <div id="app-root" className="relative h-screen bg-dark overflow-hidden">
      {/* Video Player – fills viewport minus sidebar on desktop */}
      <div
        className="absolute top-0 left-0 h-full bg-black w-full"
      >
        <VideoPlayerStacked />
      </div>

      {/* Page content rendered here - positioned above video */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Desktop Sidebar */}
      <aside
        className="hidden md:block absolute top-0 right-0 h-full border-l border-light overflow-hidden z-20 bg-dark backdrop-blur-sm w-sidebar"
        style={{
          transform: getSidebarTranslateX(),
          transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Sidebar />
      </aside>

      {/* Content Panel - single instance handles both mobile and desktop */}
      <ContentPanel />

      {/* Mobile UI */}
      <MobileTopMenu />
      <MobileModuleBar />
    </div>
  )
} 