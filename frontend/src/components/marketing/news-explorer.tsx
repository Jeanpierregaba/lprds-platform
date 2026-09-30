'use client'

import { useMemo, useState } from 'react'
import { intlLocale } from '@/lib/utils/locale-format'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { Newspaper, Search } from 'lucide-react'
import { Reveal } from './reveal'
import type { PublicBlogPostPreview, PublicBlogTag } from '@/types/public-blog'
import { Link } from '@/i18n/navigation'

const dateFormatter = new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', year: 'numeric' })

/** Image à la une de l'article (chemins relatifs proxés par le rewrite /api/v1/*), placeholder sinon. */
function ArticleCover({ coverUrl, title }: { coverUrl: string | null; title: string }) {
  if (coverUrl) {
    return (
      <Image
        src={coverUrl}
        alt={title}
        fill
        unoptimized
        sizes="(min-width: 768px) 33vw, 100vw"
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
    )
  }
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-mint/60 to-primary/20">
      <Newspaper className="size-10 text-primary/50" />
    </div>
  )
}

function ArticleCard({ article, delay = 0 }: { article: PublicBlogPostPreview; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <Link
        href={`/actualites/${article.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-3xl bg-background shadow-sm ring-1 ring-border transition-all hover:-translate-y-1 hover:shadow-lg"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-muted">
          <ArticleCover coverUrl={article.coverUrl} title={article.title} />
        </div>
        <div className="flex flex-1 flex-col p-6">
          {article.tag && <span className="text-xs font-semibold uppercase tracking-wide text-accent">{article.tag.name}</span>}
          {article.publishedAt && (
            <time className="mt-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {dateFormatter.format(new Date(article.publishedAt))}
            </time>
          )}
          <h3 className="mt-2 font-display text-lg leading-snug text-primary group-hover:underline">{article.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{article.excerpt}</p>
        </div>
      </Link>
    </Reveal>
  )
}

export function NewsExplorer({ articles, tags }: { articles: PublicBlogPostPreview[]; tags: PublicBlogTag[] }) {
  const t = useTranslations('marketing.newsPage')
  const [filter, setFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  const categories = useMemo(() => [{ id: 'all', name: t('allCategories') }, ...tags], [tags, t])
  const featured = articles[0] ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return articles.filter((article) => {
      const matchesTag = filter === 'all' || article.tag?.id === filter
      const matchesQuery = !q || article.title.toLowerCase().includes(q) || article.excerpt.toLowerCase().includes(q)
      return matchesTag && matchesQuery && article.id !== featured?.id
    })
  }, [articles, filter, query, featured?.id])

  const showFeatured = featured && filter === 'all' && !query.trim()

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setFilter(category.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filter === category.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
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
            <div className="flex flex-col justify-center p-6 sm:p-10">
              <span className="w-fit rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">{t('featured')}</span>
              {featured.tag && (
                <span className="mt-3 text-xs font-semibold uppercase tracking-wide text-primary-foreground/70">
                  {featured.tag.name}
                </span>
              )}
              {featured.publishedAt && (
                <time className="mt-1.5 text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
                  {dateFormatter.format(new Date(featured.publishedAt))}
                </time>
              )}
              <h3 className="mt-2 font-display text-2xl leading-snug group-hover:underline sm:text-3xl">{featured.title}</h3>
              <p className="mt-3 text-primary-foreground/80">{featured.excerpt}</p>
            </div>
            <div className="relative min-h-48 bg-primary-foreground/5 sm:min-h-full">
              <ArticleCover coverUrl={featured.coverUrl} title={featured.title} />
            </div>
          </Link>
        </Reveal>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
        {filtered.length === 0 ? (
          <p className="col-span-full py-16 text-center text-muted-foreground">{t('empty')}</p>
        ) : (
          filtered.map((article, i) => <ArticleCard key={article.id} article={article} delay={(i % 3) * 0.06} />)
        )}
      </div>
    </>
  )
}