
'use client'

import * as React from 'react'
import { createContext, useContext, useReducer, useRef, ReactNode } from 'react'

// Types
interface VideoState {
  currentModuleIndex: number
  isPlaying: boolean
  isIdle: boolean
  currentTime: number
  duration: number
  isLoading: boolean
  // Signal for IntroOverlay: prelude was requested from intro, wait for intro video to finish
  pendingPreludeFromIntro: boolean
  // Signal for VideoPlayerStacked: sequential-forward target was clicked from idle.
  // Defer the cut to the end of the current loop iteration so it lands on the loop boundary.
  pendingSequentialTarget: number | null
}

type VideoAction =
  | { type: 'SET_MODULE'; payload: number }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'SET_IDLE'; payload: boolean }
  | { type: 'SET_TIME'; payload: number }
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PENDING_PRELUDE'; payload: boolean }
  | { type: 'SET_PENDING_SEQUENTIAL'; payload: number | null }

interface VideoContextType {
  state: VideoState
  dispatch: React.Dispatch<VideoAction>
  // Helper methods
  playModule: (index: number) => void
  togglePlayPause: () => void
  enterIdleMode: () => void
  exitIdleMode: () => void
  // Ref shared between IntroOverlay and callers (Sidebar, MobileModuleBar) —
  // set synchronously before playModule(0) so IntroOverlay can defer the prelude
  // dispatch until its main clip ends naturally.
  introPreludeRef: React.MutableRefObject<boolean>
}

// Initial state
const initialState: VideoState = {
  // Start at -1 so VideoPlayerStacked shows the intro idle clip first
  currentModuleIndex: -1,
  isPlaying: false,
  // Begin in idle mode so the intro clip loops automatically
  isIdle: true,
  currentTime: 0,
  duration: 0,
  isLoading: true,
  pendingPreludeFromIntro: false,
  pendingSequentialTarget: null,
}

// Reducer
function videoReducer(state: VideoState, action: VideoAction): VideoState {
  switch (action.type) {
    case 'SET_MODULE':
      return {
        ...state,
        currentModuleIndex: action.payload,
        isIdle: false,
        currentTime: 0,
        pendingPreludeFromIntro: false,
        pendingSequentialTarget: null,
      }
    case 'PLAY':
      return { ...state, isPlaying: true }
    case 'PAUSE':
      return { ...state, isPlaying: false }
    case 'SET_IDLE':
      return { ...state, isIdle: action.payload }
    case 'SET_TIME':
      return { ...state, currentTime: action.payload }
    case 'SET_DURATION':
      return { ...state, duration: action.payload }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_PENDING_PRELUDE':
      return { ...state, pendingPreludeFromIntro: action.payload }
    case 'SET_PENDING_SEQUENTIAL':
      return { ...state, pendingSequentialTarget: action.payload }
    default:
      return state
  }
}

// Context
const VideoContext = createContext<VideoContextType | undefined>(undefined)

// Provider
export function VideoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(videoReducer, initialState)
  const introPreludeRef = useRef(false)

  const playModule = (index: number) => {
    // Same module + currently idle → keep looping (no-op)
    if (index === state.currentModuleIndex && state.isIdle) {
      return
    }

    // From intro (-1)
    if (state.currentModuleIndex === -1) {
      if (index === 0) {
        // Prelude: defer to IntroOverlay, which waits for intro main to end
        // (or the current loop iteration to finish) before dispatching SET_MODULE.
        introPreludeRef.current = true
        dispatch({ type: 'SET_PENDING_PRELUDE', payload: true })
        return
      }
      // Non-prelude target: IntroOverlay handles fade-to-black and PLAY
      dispatch({ type: 'SET_MODULE', payload: index })
      return
    }

    // From idle + sequential-forward target → defer the cut to the loop boundary.
    // VideoPlayerStacked watches pendingSequentialTarget and schedules the dispatch
    // so the cut lands on the loop's last frame (matched to next module's frame 0).
    if (
      state.isIdle &&
      state.currentModuleIndex >= 0 &&
      index === state.currentModuleIndex + 1
    ) {
      // Re-click of the same pending target → no-op
      if (state.pendingSequentialTarget === index) return
      dispatch({ type: 'SET_PENDING_SEQUENTIAL', payload: index })
      return
    }

    // Any other path (mid-main, non-sequential, backward): clear any pending defer
    // so a user can escape a queued boundary cut by choosing a different target.
    if (state.pendingSequentialTarget !== null) {
      dispatch({ type: 'SET_PENDING_SEQUENTIAL', payload: null })
    }

    // From any module (main or loop) → any target. Transition style is decided
    // by VideoPlayerStacked using state.isIdle (loop) vs !state.isIdle (mid-main)
    // and sequential vs non-sequential target.
    dispatch({ type: 'SET_MODULE', payload: index })
    dispatch({ type: 'PLAY' })
  }

  const togglePlayPause = () => {
    dispatch({ type: state.isPlaying ? 'PAUSE' : 'PLAY' })
  }

  const enterIdleMode = () => {
    dispatch({ type: 'SET_IDLE', payload: true })
    dispatch({ type: 'PAUSE' })
  }

  const exitIdleMode = () => {
    dispatch({ type: 'SET_IDLE', payload: false })
  }

  const value: VideoContextType = {
    state,
    dispatch,
    playModule,
    togglePlayPause,
    enterIdleMode,
    exitIdleMode,
    introPreludeRef
  }

  return <VideoContext.Provider value={value}>{children}</VideoContext.Provider>
}

// Hook
export function useVideo() {
  const context = useContext(VideoContext)
  if (context === undefined) {
    throw new Error('useVideo must be used within a VideoProvider')
  }
  return context
}
