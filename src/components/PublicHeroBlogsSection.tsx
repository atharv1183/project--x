import { useState, useMemo } from "react";
import { allContent, PublicContent } from "@/data/content";
import { Card } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PublicHeroBlogsSection = () => {
  const blogs = useMemo(() => allContent.filter(c => c.type === 'blog' || c.type === 'city').reverse(), []);
  const categories = useMemo(() => {
    const cats = new Set(blogs.map(b => b.category).filter(Boolean));
    return ['All', ...Array.from(cats)];
  }, [blogs]);

  const [activeCategory, setActiveCategory] = useState('All');

  const filteredBlogs = useMemo(() => {
    if (activeCategory === 'All') return blogs.filter(b => !b.featured);
    return blogs.filter(b => !b.featured && b.category === activeCategory);
  }, [blogs, activeCategory]);

  const [visibleCount, setVisibleCount] = useState(9);
  const visibleBlogs = useMemo(() => filteredBlogs.slice(0, visibleCount), [filteredBlogs, visibleCount]);

  const featuredBlogs = useMemo(() => blogs.filter(b => b.featured), [blogs]);
  const mainFeatured = featuredBlogs[0];
  const sideFeatured = featuredBlogs.slice(1);

  if (blogs.length === 0) {
    return (
      <section id="blogs" className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600 mb-3">Insights & News</p>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Our Latest Blogs</h2>
          <div className="py-16 bg-gray-50 rounded-3xl border border-gray-100 flex flex-col items-center justify-center">
            <h3 className="text-xl font-medium text-gray-500 mb-2">Blogs are coming soon</h3>
            <p className="text-gray-400 max-w-md mx-auto text-sm">
              We are working hard to bring you the best insights and updates. Check back later!
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="blogs" className="py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Left Navigation */}
          <div className="lg:w-48 shrink-0">
            <h3 className="text-xl font-bold mb-4 hidden lg:block">Categories</h3>
            <div className="flex lg:flex-col gap-2 overflow-x-auto pb-4 lg:pb-0 scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all whitespace-nowrap lg:whitespace-normal font-medium text-sm ${
                    activeCategory === cat
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Main Grid */}
          <div className="flex-1">
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {visibleBlogs.map((blog) => (
                <a key={blog.slug} href={`/${blog.type}/${blog.slug}`} className="group block">
                  <Card className="h-full border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 bg-white flex flex-col">
                    <div className="aspect-[4/3] bg-gray-100 relative overflow-hidden shrink-0">
                      {blog.imageUrl ? (
                        <img 
                          src={blog.imageUrl} 
                          alt={blog.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-blue-50 text-blue-200">
                          <span className="text-4xl font-bold opacity-50">Blog</span>
                        </div>
                      )}
                      <div className="absolute top-3 right-3 bg-blue-900/80 backdrop-blur text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
                        {blog.category}
                      </div>
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <h4 className="font-bold text-gray-900 mb-2 leading-tight group-hover:text-blue-600 transition-colors line-clamp-2">
                        {blog.title}
                      </h4>
                      <p className="text-xs text-gray-400 mb-3">Updated on {blog.date}</p>
                      <p className="text-sm text-gray-600 line-clamp-2 mb-4 flex-1">
                        {blog.description}
                      </p>
                      <span className="inline-flex items-center text-sm font-bold text-blue-600 group-hover:text-blue-700 mt-auto">
                        Read More <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                      </span>
                    </div>
                  </Card>
                </a>
              ))}
            </div>
            
            {visibleCount < filteredBlogs.length && (
              <div className="mt-10 flex justify-center">
                <Button 
                  onClick={() => setVisibleCount(prev => prev + 9)}
                  className="bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold px-8"
                >
                  LOAD MORE
                </Button>
              </div>
            )}
          </div>

          {/* Right Featured Section */}
          <div className="lg:w-[320px] xl:w-[380px] shrink-0 flex flex-col gap-6">
            {mainFeatured && (
              <a href={`/${mainFeatured.type}/${mainFeatured.slug}`} className="block group">
                <div className="relative rounded-2xl overflow-hidden bg-blue-600 text-white h-full min-h-[320px] p-8 flex flex-col justify-center">
                  <div className="absolute inset-0 bg-gradient-to-tr from-blue-700 to-blue-500 opacity-90 z-0"></div>
                  {mainFeatured.imageUrl && (
                    <img 
                      src={mainFeatured.imageUrl} 
                      className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-30 group-hover:scale-105 transition-transform duration-700" 
                      alt=""
                    />
                  )}
                  <div className="relative z-10">
                    <h3 className="text-3xl font-bold leading-tight mb-4 group-hover:text-blue-50 transition-colors">
                      {mainFeatured.title}
                    </h3>
                    <p className="text-blue-100 text-sm mb-8 max-w-sm">
                      {mainFeatured.description}
                    </p>
                    <Button className="bg-white text-blue-600 hover:bg-gray-50 uppercase tracking-widest text-xs font-bold px-6">
                      Read More
                    </Button>
                  </div>
                </div>
              </a>
            )}

            {sideFeatured.length > 0 && (
              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <h4 className="font-bold text-lg text-blue-900 mb-4">Featured Blog</h4>
                <div className="space-y-4">
                  {sideFeatured.slice(0, 3).map((blog) => (
                    <a key={blog.slug} href={`/${blog.type}/${blog.slug}`} className="flex gap-4 group">
                      <div className="w-24 h-16 rounded-lg bg-gray-200 overflow-hidden shrink-0">
                        {blog.imageUrl && (
                           <img 
                            src={blog.imageUrl} 
                            alt={blog.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                           />
                        )}
                      </div>
                      <div>
                        <h5 className="font-semibold text-sm text-gray-900 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">
                          {blog.title}
                        </h5>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] uppercase font-bold text-blue-600">{blog.category}</span>
                          <span className="text-gray-300 text-xs">|</span>
                          <span className="text-[10px] text-gray-400">{blog.date}</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
};
