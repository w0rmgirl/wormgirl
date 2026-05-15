import Hls from 'hls.js'

/**
 * Attaches an HLS stream to a <video> element.
 *
 * If the browser supports HLS natively (Safari, some Smart TVs) we simply set
 * the `src` directly. Otherwise we fall back to hls.js + MSE.
 *
 * The helper also handles re-attaching when the same element is reused with a
 * different source and cleans up any previous hls.js instances stored on the
 * element (as `_hls`).
 */
export default function attachHls(video: HTMLVideoElement, src: string) {
  if (!video || !src) return

  const canNative =
    video.canPlayType('application/vnd.apple.mpegurl') === 'probably' ||
    video.canPlayType('application/vnd.apple.mpegurl') === 'maybe' ||
    video.canPlayType('application/x-mpegURL') === 'probably' ||
    video.canPlayType('application/x-mpegURL') === 'maybe'

  // If the current attachment already matches, do nothing
  const currentSrc = (video as any)._hlsSrc ?? video.currentSrc ?? video.src
  if (currentSrc === src) return

  // Clean up any previous hls.js instance
  if ((video as any)._hls) {
    ;(video as any)._hls.destroy()
    delete (video as any)._hls
    delete (video as any)._hlsSrc
  }

  if (canNative) {
    // Native playback – just set the src attribute.
    // Prefer this over hls.js whenever the browser supports HLS natively (Safari,
    // including iOS). hls.js fetches the manifest via XHR, which fails CORS on
    // Mux's signed rendition URLs on iOS Safari and causes a black screen.
    video.src = src
    return
  }

  if (Hls.isSupported()) {
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

  // As a last resort, attempt progressive MP4 fallback (will work on most browsers)
  // Mux provides a high-quality MP4 rendition at /high.mp4
  if (src.endsWith('.m3u8')) {
    video.src = src.replace('.m3u8', '/high.mp4')
  } else {
    video.src = src
  }
} 