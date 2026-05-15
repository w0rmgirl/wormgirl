# Worm Girl — Project Guide

> **Read this file before making any changes.** Update it after significant architectural changes.

## Overview

Single-page educational web app with a persistent video player, modular content, and rich-text articles. Built with **Next.js 14 (App Router)**, **Sanity CMS**, and **MUX video streaming**. Deployed on Vercel.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 14 App Router, React 18, TypeScript |
| Styling | Tailwind CSS 3 + CSS variables, styled-components |
| CMS | Sanity v3 (GROQ queries, Portable Text) |
| Video | MUX HLS streams via hls.js, native HLS for Safari |
| Deployment | Vercel |

## Directory Map

```
src/
├── app/
│   ├── layout.tsx          # Root layout — provider stack wraps everything
│   ├── page.tsx            # Minimal; content driven by layout + contexts
│   ├── globals.css         # Tailwind base + CSS custom properties
│   └── studio/             # Sanity Studio route (/studio)
├── components/
│   ├── VideoPlayerStacked  # Core: two <video> elements per module (main + loop), fade transitions
│   ├── IntroOverlay        # Splash screen with intro main + intro loop, auto-dismiss
│   ├── Sidebar             # Desktop nav: modules (Roman numerals) + content pages
│   ├── ContentPanel        # Article display (module body or content pages), cross-fade
│   ├── MobileTopMenu       # Mobile menu overlay for content pages
│   ├── MobileModuleBar     # Mobile module carousel at bottom
│   ├── PreLoader           # Full-page loading bar on first visit
│   ├── TruncatedDescription # "See More/Less" text overflow
│   └── ImageCarousel       # Click-to-navigate image carousel
├── context/
│   ├── VideoContext         # Playback state, playModule(), idle phase
│   ├── PageStateContext     # Navigation: module vs content page, panel stage
│   ├── ModulesContext       # Fetches modules from Sanity, provides getModule()
│   └── ContentPagesContext  # Fetches about/library pages from Sanity
├── lib/
│   ├── sanity.ts           # Sanity client, GROQ queries, types, fetch helpers
│   ├── timecode.ts         # HH;MM;SS;FF → seconds (30fps)
│   ├── attachHls.ts        # HLS stream attachment with Safari/hls.js fallback
│   └── hooks/
│       ├── useFootnotes    # Footnote registration, scroll-to, highlight
│       ├── useGlossary     # Glossary term registration, scroll-to, highlight
│       └── useIsMobile     # Breakpoint detection (default 768px)
└── schemas/                # Sanity document schemas (module, intro, aboutPage, etc.)
```

## Provider Stack (layout.tsx)

```
ContentPagesProvider
  └── ModulesProvider
        └── VideoProvider
              └── PageStateProvider
                    └── LayoutContent (all visible UI)
```

## Video System — How It Works

### Two-Clip Architecture (per module)

Each module ships two video assets:

- `video` (main): the animated event, plays once to its natural end.
- `idleVideo` (loop): a short seamless cycle (~3s, last frame matches first frame), played with native HTML5 `<video loop>`.

Both `<video>` elements are rendered for every module, stacked via absolute positioning. Opacity selects which one is visible. All modules' elements render from page load (including during the intro) so HLS pre-buffering can run in parallel.

**Phase state**: `videoState.isIdle === false` → main is visible. `videoState.isIdle === true` → loop is visible. The transition between phases happens inside `handleMainEnded` on the main element — instant swap, no fade.

**Fallback for missing loopVideo** (transitional state during asset migration): if a module has no `idleVideo` uploaded, main pauses on its last frame instead of swapping. Drift freezes. The Next Chapter button still appears.

### Transitions

Decision rule, applied in `VideoPlayerStacked`'s `useLayoutEffect` on `currentIndex` change:

| Previous phase | Target | Behavior |
|----------------|--------|----------|
| Intro | Any | IntroOverlay handles it |
| Main (mid-clip) | Any module | Fade-to-black (~920ms) |
| Loop | Sequential next | Instant cut, no fade |
| Loop | Non-sequential | Fade-to-black |

The "previous phase" is determined by `prevIsIdleRef`, which mirrors `videoState.isIdle` from the previous render (captured before SET_MODULE flips it back to false).

### Intro → Prelude (seamless cut)

Intro's last frame is authored to match prelude's first frame.

1. `playModule(0)` while currentModuleIndex === -1 sets `introPreludeRef.current = true` synchronously and dispatches `SET_PENDING_PRELUDE` (but NOT `SET_MODULE`).
2. IntroOverlay watches `pendingPreludeFromIntro`.
   - If intro is still in its main phase: wait for `ended`. On main end, `handleMainEnded` calls `triggerPreludeTransition` (because `pendingPreludeRef` is set).
   - If intro is already in loop phase: schedule `setTimeout` for `(loop.duration - loop.currentTime - 30ms)`, so the cut lands on the last frame of the current loop iteration. Requires the loop's last frame to be authored to match prelude main frame 0.
3. `triggerPreludeTransition` dispatches `SET_MODULE(0)` + `PLAY`, sets `instantCut = true` (disables overlay opacity transition), and calls `onFinish` after 50ms.

### Intro → non-prelude module

IntroOverlay handles the entire fade-to-black sequence (300ms fade in, wait for target video to be decoded at frame 0, 300ms fade out). VideoPlayerStacked sees `prevIndexRef === -1` and just snaps the new module's main into place.

### Key Mechanism: renderTick

When the layout effect updates `prevIndexRef` (instant-cut or from-intro paths), `setRenderTick(c => c + 1)` forces a synchronous re-render before paint so the opacity calc sees the updated ref and no stale frame paints.

## Navigation Flow

```
Sidebar / module bar / Next Chapter button → playModule(index) + setModulePage(index, slug)
                    ↓
          VideoContext.playModule:
            • Same module + idle → no-op
            • From intro + prelude → SET_PENDING_PRELUDE (IntroOverlay handles)
            • From intro + non-prelude → SET_MODULE (IntroOverlay handles fade + PLAY)
            • Any module → any target → SET_MODULE + PLAY
                    ↓
          VideoPlayerStacked useLayoutEffect on currentIndex change:
            • From intro (prev === -1) → snap, no fade (IntroOverlay handled it)
            • Previous was loop + sequential next → instant cut (renderTick forces sync re-render)
            • Previous was loop + non-sequential → fade-to-black (~920ms)
            • Previous was mid-main → fade-to-black (~920ms)
                    ↓
          ContentPanel cross-fade (920ms) runs in parallel for fade-to-black transitions
```

## PreLoader → IntroOverlay Handoff

PreLoader is rendered OUTSIDE the provider stack (in layout.tsx). It communicates with IntroOverlay via a custom DOM event:
- IntroOverlay dispatches `window.dispatchEvent(new Event('intro-video-ready'))` when `handleCanPlay` fires
- PreLoader listens for both `window.load` AND `intro-video-ready` before completing the progress bar past 90%

PreLoader completes past 90% and fades out once both signals arrive.

## Sanity Data Model

| Document | Key Fields |
|----------|------------|
| **module** | title, slug, order, timeline, video (mux, main playthrough), idleVideo (mux, seamless loop), articleHeading, body (blockContent), glossary[], footnotes[], tabImage |
| **intro** | video (zoom-in), idleVideo (held-camera loop), buttonLabel |
| **aboutPage** | title, slug, content (blockContent) |
| **libraryPage** | title, slug, description, sound[], books[] |
| **blockContent** | Portable Text with marks: strong, em, smallCaps, footnoteRef, glossaryRef |

## Git Branches

| Branch | Status | Purpose |
|--------|--------|---------|
| `main` | Production | Stable release |
| `feature/single-video-timestamps` | **Active** | Current work: video timecode & transition fixes |
| `feature/midpoint-exit-logic` | In-flight | Midpoint exit behavior |

## History

### 2026-05-14 — Two-clip revert
Reverted the single-clip-with-baked-3s-idle-loop architecture to the original two-clip pattern (`video` main + `idleVideo` loop with native `<video loop>`). The single-clip approach had been introduced (commit `879c803`, 2026-03-26) to support a "wiggle" idle effect that has since been killed. Reverting eliminated the hls.js last-frame-skip bug, the `QUEUE_MODULE` machinery, the `nearEnd` threshold race, and the intro-to-prelude `pendingPreludeRef` suppression logic. Mid-main clicks now use the same fade-to-black as out-of-order jumps (per user direction). Plan: `/Users/e/.claude/plans/plan-the-refactor-now-floofy-beaver.md`. See "Asset Migration" below.

### Asset Migration (in progress)
Modules and the intro need re-export from Blender as two separate clips each: a `video` main (the animated event, no baked tail) and an `idleVideo` loop (a seamless ~3s cycle where the last frame matches the first). Until a module's `idleVideo` is uploaded, the fallback behavior pauses main on its last frame.

### Earlier fixes still relevant
- **PreLoader sync with intro video**: PreLoader waits for both `window.load` AND `intro-video-ready` custom DOM event (dispatched by IntroOverlay on `canPlay`) before completing past 90%.
- **Intro-to-prelude frame cut on mobile**: VideoPlayerStacked wraps videos in a content-panel-aware `translateY` wrapper. IntroOverlay applies the same wrapper so the intro→prelude cut has no vertical shift. **Critical**: if you change the wrapper transform in one, change it in the other.

## Debug Tools

- Press **`d`** key on the video player or intro overlay to toggle a debug overlay showing video state, timecodes, readyState, etc.

## Environment Variables

```
NEXT_PUBLIC_SANITY_PROJECT_ID
NEXT_PUBLIC_SANITY_DATASET
NEXT_PUBLIC_SANITY_API_VERSION
SANITY_API_READ_TOKEN
SANITY_API_WRITE_TOKEN
NEXT_PUBLIC_SANITY_TOKEN
SANITY_PREVIEW_SECRET
MUX_TOKEN_ID
MUX_TOKEN_SECRET
```

## Conventions

- Single-page app: no route-based navigation. All navigation via context state.
- Mobile breakpoint: 768px (md in Tailwind).
- Video URLs: `https://stream.mux.com/{playbackId}.m3u8`
- Timecodes in Sanity: `HH;MM;SS;FF` format at 30fps (semicolons as delimiters).
- Content panel stages: `hidden` → `peek` → `expanded` (mobile slides up; desktop is side panel).
- Inter-component signals outside provider stack use custom DOM events (e.g., `intro-video-ready`).

## Mobile Video Position Drift System (2026-03-27)

Mobile videos use animated `object-position` to create a slow pan/drift effect. The system is driven by a `requestAnimationFrame` loop (not CSS transitions) for smooth 60fps updates.

### Architecture
- **IntroOverlay**: Has its own rAF loop for the intro video drift. Config in `VIDEO_POSITIONS.intro`.
- **VideoPlayerStacked**: Single rAF loop handles all module video drifts. Config in `MODULE_POSITIONS[]`.
- Both components apply the same content-panel-aware `translateY` wrapper so the intro→prelude cut is seamless. **Critical**: If you change the video shift transform in one, change it in the other.

### Position Config (`MODULE_POSITIONS` in VideoPlayerStacked)
- **Simple drift**: `{ start: [x,y], end: [x,y], driftEnd?: timecode }` — single linear drift with cubic ease-in.
- **Multi-drift**: `{ start, end, drifts: [{ end, driftEnd, driftStart? }] }` — multiple sequential drift phases with holds between them. Each phase uses cubic ease-in (`t³`).
- `start` of module N MUST match `end` of module N-1 (or intro end for module 0).
- `end` must match the last drift phase's end position.
- `driftEnd` timecode = when drift reaches end position (within main playback). If omitted on simple drift, falls back to main `duration`. Drift freezes at its last computed value when the loop phase takes over.
- `driftStart` timecode = when a drift phase begins (for multi-drift gaps/holds).

### Why rAF instead of CSS transitions
CSS `transition: object-position 0.5s` caused visible "shimmy" — each coarse `timeupdate` (~250ms on hls.js) set a new target, and CSS eased to it in a steppy pattern. Direct DOM writes at 60fps via rAF eliminated this.

### Critical: IntroOverlay ↔ VideoPlayerStacked transform sync
IntroOverlay wraps its video in a `translateY` div that mirrors VideoPlayerStacked's content-panel-aware shift (`-2rem` for peek, `-60vh` for expanded). Without this, the intro→prelude cut shows a vertical shift because the two `<video>` elements are at different Y positions. This was the root cause of a persistent "frame cut" bug that appeared to be a content mismatch but was actually a 32px offset.

### Current Position Values
```
Intro:    [50, 50] → [53, 50]  driftEnd: 00;00;05;12
Module 0: [53, 50] → [36, 50]  driftEnd: 00;00;06;12
Module 1: [36, 50] → [60, 40]  driftEnd: 00;00;06;00
Module 2: [60, 40] → drift1 [30, 15] @ 00;00;20;00 → hold → drift2 [45, 35] @ 00;00;24;00–00;00;28;00
Module 3+: TBD (currently static)
```

## Mobile Fixes Checklist (2026-03-27)

- [x] 1. Match mobile module tab bar text + styling to desktop (added `text-light` to inactive button state)
- [ ] 2. Next Chapter / Prelude button appears above the mobile module tab bar (use `barGap` offset)
- [ ] 3. Reduce content panel top padding and peek height so more video shows
- [x] 4. Audit video position — implemented drift system with per-module animated object-position
- [ ] 5. Top menu: About + Library tabs split width, smaller height, center-aligned text. Library missing books section in DOM.
- [x] 6. Fix glossary/footnotes click-to-scroll on mobile (hooks bail out with `if (isMobile) return`)
- [ ] 7. Desktop: glossary/footnote anchor links scroll to wrong position after panel expand/contract. Also need more top offset so highlighted word isn't on the very first line.
- [ ] 8. **Smooth out drift animation**: The rAF-driven object-position drift still looks choppy/loopy in practice. The cubic ease-in (`t³`) may be too aggressive, or the position updates may need interpolation smoothing (e.g. exponential decay / lerp toward target instead of snapping to calculated position each frame). Investigate on both Safari and Chrome.
- [ ] 9. **Real device mobile audit**: All current mobile positioning (video drift, content panel, translateY shifts, module bar) was tuned using desktop browser at mobile viewport size. On actual mobile devices things look off — likely due to differences in viewport height (Safari chrome bar, safe area insets), touch behavior, and how `vh` units resolve. Needs hands-on testing with a real device and adjustments.
