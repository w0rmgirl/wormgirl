'use client'

import { useEffect, useState } from 'react'

export default function LoadingDots({ intervalMs = 300 }: { intervalMs?: number }) {
  const [count, setCount] = useState(1)
  useEffect(() => {
    const id = window.setInterval(() => {
      setCount((c) => (c % 3) + 1)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return (
    <span style={{ display: 'inline-block', textAlign: 'left' }}>
      {'.'.repeat(count)}
      <span style={{ visibility: 'hidden' }}>{'.'.repeat(3 - count)}</span>
    </span>
  )
}
