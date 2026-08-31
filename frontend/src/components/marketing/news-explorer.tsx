'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Reveal } from './reveal'
import { NEWS, NEWS_CATEGORIES, type NewsArticle } from '@/lib/marketing/data'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

function ArticleCard({ article, delay = 0 }: { article: NewsArticle; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <Link
        href={`/actualites/${article.id}`}
        className="group flex h-full flex-col rounded-3xl bg-background p-6 shadow-sm ring-1 ring-border transition-all hover:-translate-y-1 hover:shadow-lg"
      >
        <span className="text-3xl">{article.emoji}</span>
        <time className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {dateFormatter.format(new Date(article.date))}
        </time>
        <h3 className="mt-2 font-display text-lg leading-snug text-primary group-hover:underline">{article.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p>
      </Link>
    </Reveal>
  )
}

export function NewsExplorer() {
  const [filter, setFilter] = useState<(typeof NEWS_CATEGORIES)[number]['id']>('all')
  const [query, setQuery] = useState('')

  const featured = NEWS.find((a) => a.featured)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return NEWS.filter((a) => {
      const matchesCategory = filter === 'all' || a.category === filter
      const matchesQuery = !q || a.title.toLowerCase().includes(q) || a.excerpt.toLowerCase().includes(q)
      return matchesCategory && matchesQuery && a.id !== featured?.id
    })
  }, [filter, query, featured?.id])

  const showFeatured = featured && filter === 'all' && !query.trim()

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {NEWS_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(c.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filter === c.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher..."
            className="h-11 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm outline-none ring-primary/30 transition-shadow focus:ring-3"
          />
        </div>
      </div>

      {showFeatured && (
        <Reveal className="mt-10">
          <Link
            href={`/actualites/${featured.id}`}
            className="group grid grid-cols-1 overflow-hidden rounded-3xl bg-primary text-primary-foreground shadow-lg sm:grid-cols-2"
          >
            <div className="flex flex-col justify-center p-8 sm:p-10">
              <span className="w-fit rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                À la une
              </span>
              <time className="mt-4 text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
                {dateFormatter.format(new Date(featured.date))}
              </time>
              <h3 className="mt-2 font-display text-2xl leading-snug group-hover:underline sm:text-3xl">{featured.title}</h3>
              <p className="mt-3 text-primary-foreground/80">{featured.excerpt}</p>
            </div>
            <div className="flex items-center justify-center bg-primary-foreground/5 p-10 text-8xl">{featured.emoji}</div>
          </Link>
        </Reveal>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {filtered.length === 0 ? (
          <p className="col-span-full py-16 text-center text-muted-foreground">Aucun article ne correspond à votre recherche.</p>
        ) : (
          filtered.map((article, i) => <ArticleCard key={article.id} article={article} delay={(i % 3) * 0.06} />)
        )}
      </div>
    </>
  )
}
