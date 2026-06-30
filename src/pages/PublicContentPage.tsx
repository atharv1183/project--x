import { useMemo } from 'react';
import { allContent, ContentType } from '@/data/content';
import { ArrowLeft, Calendar, Tag, Smartphone, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicFooter } from '@/components/PublicFooter';

interface Props {
  type: ContentType | string;
  slug: string;
}

export default function PublicContentPage({ type, slug }: Props) {
  const content = useMemo(() => {
    return allContent.find(c => c.type === type && c.slug === slug);
  }, [type, slug]);

  if (!content) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-gray-600 mb-8">The content you are looking for does not exist.</p>
        <Button onClick={() => window.history.back()} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Simple Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <nav className="max-w-4xl mx-auto flex items-center px-6 py-4">
          <button 
            onClick={() => window.location.href = '/blogs'}
            className="flex items-center text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Blogs
          </button>
        </nav>
      </header>

      {/* Content Body */}
      <main className="pt-32 pb-24 px-6 max-w-3xl mx-auto">
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider">
              <Tag className="w-3 h-3" /> {content.category}
            </span>
            <span className="flex items-center text-sm text-gray-500">
              <Calendar className="w-4 h-4 mr-1.5" /> {content.date}
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            {content.title}
          </h1>
          <p className="text-xl text-gray-500 leading-relaxed mb-8">
            {content.description}
          </p>

          {content.imageUrl && (
            <div className="rounded-2xl overflow-hidden mb-12 shadow-lg">
              <img 
                src={content.imageUrl} 
                alt={content.title} 
                className="w-full max-h-[500px] object-cover"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          )}
        </div>

        <article className="prose prose-lg prose-blue max-w-none text-gray-700">
          {/* If the user uses markdown in the future, we can plug in react-markdown here. */}
          {/* For now, we render plain text with line breaks preserved. */}
          <div className="whitespace-pre-wrap font-serif text-lg leading-loose">
            {content.content}
          </div>
        </article>

        {/* ── CTA Banner ── */}
        <div className="mt-20 mb-4 rounded-3xl overflow-hidden relative">
          {/* Background Gradient */}
          <div
            className="absolute inset-0 z-0"
            style={{
              background:
                "linear-gradient(135deg, #0b1021 0%, #0d2a2a 50%, #1a3a1a 100%)",
            }}
          />
          {/* Subtle animated blobs */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl z-0" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl z-0" />

          <div className="relative z-10 py-14 px-8 md:px-16 flex flex-col items-center text-center gap-6">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
              <Smartphone className="w-7 h-7 text-amber-400" />
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight max-w-xl">
              Ready to transform your real estate business?
            </h2>
            <p className="text-white/60 text-base max-w-md">
              Join enterprises scaling with structure, visibility and accountability.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mt-2">
              <a href="/book-demo">
                <Button
                  className="bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold px-8 py-3 rounded-xl text-sm flex items-center gap-2 transition-all shadow-lg shadow-amber-400/20 hover:shadow-amber-400/40"
                >
                  Book a Free Demo <ArrowRight className="w-4 h-4" />
                </Button>
              </a>
              <a href="/book-demo">
                <button
                  className="border border-white/40 text-white bg-white/10 hover:bg-white/20 font-semibold px-8 py-3 rounded-xl text-sm transition-all"
                >
                  Contact Sales
                </button>
              </a>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
