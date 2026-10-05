import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { marketingPath } from '@/i18n/slugs'
import { asAppLocale } from '@/i18n/routing'
import { intlLocaleFor } from '@/lib/utils/locale-format'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft, Newspaper } from 'lucide-react'
import { CtaBand } from '@/components/marketing/cta-band'
import { Reveal } from '@/components/marketing/reveal'
import { BRAND } from '@/lib/marketing/data'
import { fetchPublicBlogPost, fetchPublicBlogPosts } from '@/lib/api/public-blog.api'
import type { PublicBlogPostPreview } from '@/types/public-blog'
import { Link } from '@/i18n/navigation'
import { thumbUrl } from '@/lib/media/thumb'


export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const article = await fetchPublicBlogPost(id, asAppLocale(await getLocale()))
  if (!article) return {}
  return {
    title: `${article.title} — ${BRAND.name}`,
    description: article.content.slice(0, 200),
  }
}

export default async function NewsArticlePage({ params }: { params: Promise<{ id: string }> }) {
  // Page rendue côté serveur : la locale vient du segment d'URL, pas du
  // cookie — `intlLocale()` y retomberait invariablement sur le français.
  const locale = asAppLocale(await getLocale())
  const t = await getTranslations('marketing.newsArticle')
  const dateFormatter = new Intl.DateTimeFormat(
    intlLocaleFor(locale),
    { day: 'numeric', month: 'long', year: 'numeric' },
  )
  const { id } = await params
  const article = await fetchPublicBlogPost(id, locale)
  if (!article) notFound()

  let related: PublicBlogPostPreview[] = []
  if (article.tag) {
    const sameTag = await fetchPublicBlogPosts(article.tag.id, locale)
    related = sameTag.filter((post) => post.id !== article.id).slice(0, 2)
  }

  return (
    <>
      <article className="px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-32 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <Link href={marketingPath('/actualites', locale)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" />
            {t('allNews')}
          </Link>

          {article.coverUrl && (
            <Reveal className="mt-6">
              <div className="relative aspect-[16/9] overflow-hidden rounded-3xl">
                <Image
                  src={article.coverUrl}
                  alt={article.title}
                  fill
                  unoptimized
                  sizes="(max-width: 672px) 100vw, 672px"
                  className="object-cover"
                />
              </div>
            </Reveal>
          )}

          <Reveal className={article.coverUrl ? 'mt-8' : 'mt-6'}>
            {article.tag && (
              <span className="inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                {article.tag.name}
              </span>
            )}
            {article.publishedAt && (
              <time className="mt-3 block text-sm text-muted-foreground">
                {dateFormatter.format(new Date(article.publishedAt))}
              </time>
            )}
            <h1 className="mt-3 font-display text-3xl leading-tight text-primary sm:text-4xl">{article.title}</h1>
            {/* Honnêteté envers le visiteur : quand la traduction manque, on
                sert le français — autant le dire plutôt que de le laisser
                croire à un problème d'affichage. */}
            {locale !== article.locale && (
              <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                {t('fallbackNotice')}
              </p>
            )}
            <div className="mt-6 whitespace-pre-line break-words border-t border-border pt-6 text-foreground/85">
              {article.content}
            </div>
          </Reveal>
        </div>
      </article>

      {related.length > 0 && (
        <section className="bg-muted/40 px-6 py-16 lg:px-8">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-xl text-primary">{t('related')}</h2>
            <div className="mt-6 space-y-4">
              {related.map((post) => (
                <Link
                  key={post.id}
                  href={`/actualites/${post.id}`}
                  className="flex items-center gap-4 rounded-2xl bg-background p-4 shadow-sm ring-1 ring-border transition-colors hover:ring-primary/40"
                >
                  {post.coverUrl ? (
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                      <Image src={thumbUrl(post.coverUrl)} alt={post.title} fill unoptimized sizes="48px" className="object-cover" />
                    </div>
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden>
                      <Newspaper className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-primary">{post.title}</p>
                    {post.publishedAt && (
                      <time className="text-xs text-muted-foreground">
                        {dateFormatter.format(new Date(post.publishedAt))}
                      </time>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaBand />
    </>
  )
}