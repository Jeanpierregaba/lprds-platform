import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft, Newspaper } from 'lucide-react'
import { CtaBand } from '@/components/marketing/cta-band'
import { Reveal } from '@/components/marketing/reveal'
import { BRAND } from '@/lib/marketing/data'
import { fetchPublicBlogPost, fetchPublicBlogPosts } from '@/lib/api/public-blog.api'
import type { PublicBlogPostPreview } from '@/types/public-blog'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const article = await fetchPublicBlogPost(id)
  if (!article) return {}
  return {
    title: `${article.title} — ${BRAND.name}`,
    description: article.content.slice(0, 200),
  }
}

export default async function NewsArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = await fetchPublicBlogPost(id)
  if (!article) notFound()

  let related: PublicBlogPostPreview[] = []
  if (article.tag) {
    const sameTag = await fetchPublicBlogPosts(article.tag.id)
    related = sameTag.filter((post) => post.id !== article.id).slice(0, 2)
  }

  return (
    <>
      <article className="px-6 pb-20 pt-32 sm:pt-40 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <Link href="/actualites" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" />
            Toutes les actualités
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
            <div className="mt-6 whitespace-pre-line border-t border-border pt-6 text-foreground/85">
              {article.content}
            </div>
          </Reveal>
        </div>
      </article>

      {related.length > 0 && (
        <section className="bg-muted/40 px-6 py-16 lg:px-8">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-xl text-primary">À lire aussi</h2>
            <div className="mt-6 space-y-4">
              {related.map((post) => (
                <Link
                  key={post.id}
                  href={`/actualites/${post.id}`}
                  className="flex items-center gap-4 rounded-2xl bg-background p-4 shadow-sm ring-1 ring-border transition-colors hover:ring-primary/40"
                >
                  {post.coverUrl ? (
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                      <Image src={post.coverUrl} alt={post.title} fill unoptimized sizes="48px" className="object-cover" />
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