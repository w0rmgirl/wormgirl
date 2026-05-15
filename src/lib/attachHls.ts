import Hls from 'hls.js'

/**
 * Attaches an HLS stream to a <video> element.
 *
 * Prefers hls.js (MSE) wherever it's supported, falling back to native HLS only
 * on browsers without MSE (iOS Safari). hls.js gives us real adaptive bitrate
 * and lets us force the top rendition; Chrome's "native" HLS reports
 * canPlayType === 'maybe' but locks to a single low rendition.
 *
 * The helper also handles re-attaching when the same element is reused with a
 * different source and cleans up any previous hls.js instances stored on the
 * element (as `_hls`).
 */
export default function attachHls(video: HTMLVideoElement, src: string) {
  if (!video || !src) return

  // Prefer hls.js wherever MSE is available (Chrome, Firefox, Edge, desktop Safari).
  // Chrome reports canPlayType('application/vnd.apple.mpegurl') === 'maybe' but its
  // built-in HLS handler does no adaptive bitrate — it locks to one rendition (often
  // the lowest), which is why videos rendered at 480x270 instead of the top rung.
  // Only fall back to native HLS when hls.js is unsupported (iOS Safari), where
  // hls.js can't use MSE anyway.
  const hlsSupported = Hls.isSupported()

  // If the current attachment already matches, do nothing
  const currentSrc = (video as any)._hlsSrc ?? video.currentSrc ?? video.src
  if (currentSrc === src) return

  // Clean up any previous hls.js instance
  if ((video as any)._hls) {
    ;(video as any)._hls.destroy()
    delete (video as any)._hls
    delete (video as any)._hlsSrc
  }

  if (hlsSupported) {
    // Use MSE via hls.js
    // First clear any src that might have been set so Chrome doesn't throw
    video.removeAttribute('src')
    try {
      video.load()
    } catch {
      /* ignore */
    }

    const hls = new Hls({
      autoStartLoad: true,

      // 1. Don’t restrict quality to the player’s size
      capLevelToPlayerSize: false,

      // 2. Tell hls.js not to start at level 0 (lowest)
      //    We’ll pick the level ourselves once we know what is available.
      startLevel: -1,
    })

    // After the manifest has been parsed we know how many levels exist.
    // Choose the very last one (highest bitrate) as the first to download.
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      hls.currentLevel = hls.levels.length - 1   // highest
    })

    hls.loadSource(src)
    hls.attachMedia(video)
    ;(video as any)._hls = hls
    ;(video as any)._hlsSrc = src
    return
  }

  // No MSE available — iOS Safari path. Use native HLS by setting src directly.
  // hls.js can't run here (no MSE), and Mux signed rendition URLs cause CORS
  // issues when hls.js tries to XHR them on iOS anyway.
  video.src = src
} 