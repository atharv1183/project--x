import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
              About Estate Plus CRM
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Simplifying real estate operations through powerful technology.
            </p>
          </div>

          <div className="space-y-12">
            <section className="bg-slate-50 p-8 md:p-12 rounded-3xl border border-slate-100 shadow-sm">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">Vision</h2>
              <p className="text-slate-700 leading-relaxed text-lg">
                To power one million successful real estate transactions through technology and become the operating system for India's real estate ecosystem.
              </p>
            </section>

            <section className="bg-emerald-50 p-8 md:p-12 rounded-3xl border border-emerald-100 shadow-sm">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4 text-emerald-900">Mission</h2>
              <p className="text-slate-700 leading-relaxed text-lg text-emerald-800">
                To empower every real estate professional with simple, powerful, and affordable technology that helps them increase sales, automate operations, build stronger customer relationships, and grow sustainably.
              </p>
            </section>

            <section className="p-8 md:p-12 bg-white rounded-3xl border border-slate-100 shadow-sm">
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Our Story</h2>
              <div className="space-y-6 text-slate-700 text-lg leading-relaxed">
                <p>
                  India is entering one of the biggest real estate growth phases in its history.
                </p>
                <p>
                  As cities expand, infrastructure improves, and millions of families and businesses invest in property, the real estate industry will continue to play a vital role in shaping the nation's future.
                </p>
                <p>
                  Behind every successful property transaction is a real estate professional.
                </p>
                <p>
                  Yet many brokers and agencies still rely on spreadsheets, WhatsApp chats, handwritten notes, and disconnected tools. Valuable leads are forgotten, follow-ups are missed, inventories become difficult to manage, and opportunities are lost.
                </p>
                <p className="font-semibold text-slate-900 text-xl py-2">
                  We believe real estate businesses deserve better.
                </p>
                <p>
                  That belief led to the creation of Estate Plus CRM.
                </p>
                <p>
                  Our platform helps brokers, agencies, and developers manage leads, automate follow-ups, organize property inventory, collaborate with their teams, and close more deals—all from one place.
                </p>
                <p>
                  But our ambition goes beyond building CRM software.
                </p>
                <p>
                  We are building the digital infrastructure that empowers real estate entrepreneurs to grow with confidence, serve their customers better, and contribute to a stronger, more efficient, and technology-driven real estate ecosystem.
                </p>
                <p>
                  As India progresses toward becoming a developed nation, Estate Plus CRM is committed to helping modernize the businesses that connect millions of people with their dream properties.
                </p>
                <p className="font-bold text-slate-900 text-xl mt-8">
                  Every lead managed. Every relationship strengthened. Every deal closer to success.
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
