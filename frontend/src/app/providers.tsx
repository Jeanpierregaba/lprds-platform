'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useState, useEffect } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  // useState pour ne pas partager le QueryClient entre requêtes SSR
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,     // données fraîches 60s
        retry: 1,
      },
    },
  }))

  // #region agent log
  fetch('http://127.0.0.1:7837/ingest/6671d712-9406-4ee5-bddd-f00e5170b0ff',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'27ced3'},body:JSON.stringify({sessionId:'27ced3',runId:'pre-fix',hypothesisId:'A',location:'providers.tsx:render',message:'Providers render (ThemeProvider wraps tree)',data:{isClient:typeof window!=='undefined'},timestamp:Date.now()})}).catch(()=>{});
  useEffect(() => {
    const scripts = Array.from(document.querySelectorAll('script')).map((el, i) => {
      const text = el.textContent || ''
      return {
        i,
        src: el.getAttribute('src') || '',
        parent: el.parentElement?.tagName || '',
        looksLikeNextThemes: text.includes('localStorage.getItem') && text.includes('prefers-color-scheme'),
        preview: text.slice(0, 120),
      }
    })
    fetch('http://127.0.0.1:7837/ingest/6671d712-9406-4ee5-bddd-f00e5170b0ff',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'27ced3'},body:JSON.stringify({sessionId:'27ced3',runId:'pre-fix',hypothesisId:'A',location:'providers.tsx:useEffect',message:'DOM script tags after Providers mount',data:{count:scripts.length,nextThemesInline:scripts.filter(s=>s.looksLikeNextThemes).length,scripts},timestamp:Date.now()})}).catch(()=>{});
    const orig = console.error
    console.error = (...args: unknown[]) => {
      const msg = String(args[0] ?? '')
      if (msg.includes('script tag') || msg.includes('Scripts inside React')) {
        fetch('http://127.0.0.1:7837/ingest/6671d712-9406-4ee5-bddd-f00e5170b0ff',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'27ced3'},body:JSON.stringify({sessionId:'27ced3',runId:'pre-fix',hypothesisId:'A',location:'providers.tsx:console.error',message:'Captured React script-tag warning',data:{msg:msg.slice(0,300)},timestamp:Date.now()})}).catch(()=>{});
      }
      orig.apply(console, args)
    }
    return () => { console.error = orig }
  }, [])
  // #endregion

  return (
    <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}