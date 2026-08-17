import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CtaBand } from '@/components/marketing/cta-band'
import { Reveal } from '@/components/marketing/reveal'
import { NEWS, NEWS_CATEGORIES, BRAND } from '@/lib/marketing/data'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export function generateStaticParams() {
  return NEWS.map((article) => ({ id: article.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const article = NEWS.find((a) => a.id === id)
  if (!article) return {}
  return {
    title: `${article.title} — ${BRAND.name}`,
    description: article.excerpt,
  }
}

export default async function NewsArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const article = NEWS.find((a) => a.id === id)
  if (!article) notFound()

  const categoryName = NEWS_CATEGORIES.find((c) => c.id === article.category)?.name
  const related = NEWS.filter((a) => a.id !== article.id && a.category === article.category).slice(0, 2)

  return (
    <>
      <article className="px-6 pb-20 pt-32 sm:pt-40 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <Link href="/actualites" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-4" />
            Toutes les actualités
          </Link>

          <Reveal className="mt-6">
            <div className="text-6xl">{article.emoji}</div>
            <span className="mt-6 inline-block rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
              {categoryName}
            </span>
            <time className="mt-3 block text-sm text-muted-foreground">{dateFormatter.format(new Date(article.date))}</time>
            <h1 className="mt-3 font-display text-3xl leading-tight text-primary sm:text-4xl">{article.title}</h1>
            <p className="mt-6 text-lg text-muted-foreground">{article.excerpt}</p>
            <div className="mt-6 space-y-4 border-t border-border pt-6 text-foreground/85">
              {article.content.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </Reveal>
        </div>
      </article>

      {related.length > 0 && (
        <section className="bg-muted/40 px-6 py-16 lg:px-8">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-display text-xl text-primary">À lire aussi</h2>
            <div className="mt-6 space-y-4">
              {related.map((a) => (
                <Link
                  key={a.id}
                  href={`/actualites/${a.id}`}
                  className="flex items-center gap-4 rounded-2xl bg-background p-4 shadow-sm ring-1 ring-border transition-colors hover:ring-primary/40"
                >
                  <span className="text-3xl">{a.emoji}</span>
                  <div>
                    <p className="font-medium text-primary">{a.title}</p>
                    <time className="text-xs text-muted-foreground">{dateFormatter.format(new Date(a.date))}</time>
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
