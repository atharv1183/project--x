import { useReveal } from "@/hooks/useReveal";
import { PublicHeroBlogsSection } from "../components/PublicHeroBlogsSection";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";

const PublicBlogsPage = () => {
  useReveal();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden flex flex-col font-sans">
      <PublicHeader />

      <main className="flex-1 bg-white relative">
        {/* Blogs Hero Banner */}
        <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 bg-[#0B1021] text-white overflow-hidden">
          {/* Background Elements */}
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 to-transparent" />
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-600/10 to-transparent blur-3xl transform translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-1/2 h-full bg-gradient-to-t from-teal-500/10 to-transparent blur-3xl transform -translate-x-1/2" />
            
            {/* Grid Pattern */}
            <div 
              className="absolute inset-0 opacity-[0.03]" 
              style={{
                backgroundImage: 'linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px)',
                backgroundSize: '40px 40px'
              }}
            />
          </div>

          <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-blue-300 text-sm font-medium mb-6 reveal">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Latest Insights & Resources
            </div>
            
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight reveal" style={{ transitionDelay: "100ms" }}>
              Stay Ahead in <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400">Real Estate</span>
            </h1>
            
            <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 reveal" style={{ transitionDelay: "200ms" }}>
              Expert advice, industry trends, and practical guides to help you scale your property business with Estate Plus CRM.
            </p>
          </div>
        </section>

        {/* The Blog Grid Section */}
        <div className="bg-gray-50 pb-20">
          <PublicHeroBlogsSection />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default PublicBlogsPage;
