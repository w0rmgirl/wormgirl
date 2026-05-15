'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { client, SanityModule } from '@/lib/sanity'

// Types
interface ModulesState {
  modules: SanityModule[]
  loading: boolean
  error: string | null
}

interface ModulesContextType {
  state: ModulesState
  // Helper methods
  getModule: (index: number) => SanityModule | null
  getModuleBySlug: (slug: string) => SanityModule | null
  getNextModule: (currentIndex: number) => SanityModule | null
}

// Initial state
const initialState: ModulesState = {
  modules: [],
  loading: true,
  error: null
}

// Context
const ModulesContext = createContext<ModulesContextType | undefined>(undefined)

// Provider
export function ModulesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModulesState>(initialState)

  // Fetch modules from Sanity once
  useEffect(() => {
    async function fetchModules() {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }))
        
        const fetchedModules = await client.fetch(`
          *[_type == "module"] | order(order asc) {
            _id,
            title,
            slug,
            order,
            timeline,
            video {
              asset->
            },
            idleVideo {
              asset->
            },
            tabImage {
              asset-> {
                url
              },
              crop,
              hotspot
            },
            articleHeading,
            body,
            glossary[] {
              id,
              term,
              definition
            },
            footnotes[] {
              id,
              content
            },
            excerpt
          }
        `)
        
        setState(prev => ({
          ...prev,
          modules: fetchedModules,
          loading: false,
          error: null
        }))
      } catch (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: 'Failed to load modules'
        }))
      }
    }

    fetchModules()
  }, [])

  // Helper methods
  const getModule = (index: number): SanityModule | null => {
    return index >= 0 && index < state.modules.length ? state.modules[index] : null
  }

  const getModuleBySlug = (slug: string): SanityModule | null => {
    return state.modules.find(module => module.slug.current === slug) || null
  }

  const getNextModule = (currentIndex: number): SanityModule | null => {
    return currentIndex >= 0 && currentIndex + 1 < state.modules.length 
      ? state.modules[currentIndex + 1] 
      : null
  }

  const value: ModulesContextType = {
    state,
    getModule,
    getModuleBySlug,
    getNextModule
  }

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>
}

// Hook
export function useModules() {
  const context = useContext(ModulesContext)
  if (context === undefined) {
    throw new Error('useModules must be used within a ModulesProvider')
  }
  return context
} 