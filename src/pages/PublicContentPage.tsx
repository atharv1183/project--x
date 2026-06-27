import { useMemo } from 'react';
import { allContent, ContentType } from '@/data/content';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
            onClick={() => window.location.href = '/'}
            className="flex items-center text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
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
      </main>

      {/* Simple Footer */}
      <footer className="border-t border-gray-100 py-10 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} EstatePulse. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
