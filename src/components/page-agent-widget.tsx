'use client'

import Script from 'next/script'
import { useState } from 'react'

declare global {
  interface Window {
    PageAgent?: new (config?: Record<string, unknown>) => void
  }
}

export function PageAgentWidget() {
  const [, setReady] = useState(false)

  return (
    <Script
      src="https://cdn.jsdelivr.net/npm/page-agent@1.8.2/dist/iife/page-agent.demo.js"
      strategy="afterInteractive"
      onLoad={() => {
        if (window.PageAgent) {
          new window.PageAgent({ language: 'en-US' })
        }
        setReady(true)
      }}
    />
  )
}
