import { useReveal } from "@/hooks/useReveal";
import { PublicHeader } from "../components/PublicHeader";
import { PublicFooter } from "../components/PublicFooter";
import { Phone, Mail, MapPin, CheckCircle2, ChevronRight, Users, Building2, ClipboardList, BarChart3, Smartphone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

const featureGroups = [
  {
    title: "Sales CRM",
    icon: Users,
    description: "End-to-end lead management and sales pipeline tracking for your team.",
    items: ["Lead Capture", "Lead Assignment", "Follow-ups", "Deal Pipeline", "Lead Tracking"]
  },
  {
    title: "Inventory",
    icon: Building2,
    description: "Manage projects, units, and availability across your entire organization.",
    items: ["Projects", "Inventory", "Brochures", "Sharing", "Property Management"]
  },
  {
    title: "Team Management",
    icon: ClipboardList,
    description: "Monitor team performance, attendance, and activity logs in real-time.",
    items: ["Attendance", "Activity Tracking", "Goals", "Performance", "Leaderboards"]
  },
  {
    title: "Reports",
    icon: BarChart3,
    description: "Comprehensive analytics and insights into your business performance.",
    items: ["Lead Reports", "Sales Reports", "Conversion Reports", "Revenue Reports"]
  },
  {
    title: "Mobile App",
    icon: Smartphone,
    description: "Take your CRM on the go with dedicated mobile access for sales teams.",
    items: ["Lead Updates", "Inventory Access", "Mobile CRM"]
  },
  {
    title: "Support & Security",
    icon: ShieldCheck,
    description: "Enterprise-grade security and role-based access controls.",
    items: ["Support Tickets", "Roles & Permissions", "Activity Logs", "Data Security"]
  }
];

const PublicFeaturesPage = () => {
  useReveal();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden flex flex-col">
      <PublicHeader />

      <main className="flex-1 pt-28 pb-24 bg-slate-50 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16 reveal">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-slate-900">
              Powerful Features for <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-emerald-600">
                Modern Real Estate
              </span>
            </h1>
            <p className="text-lg text-slate-600">
              Explore the complete toolset designed specifically for real estate brokers, developers, and channel partners to scale their operations.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
            {featureGroups.map((group, idx) => {
              const Icon = group.icon;
              return (
                <div key={idx} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/60 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 reveal" style={{ transitionDelay: `${idx * 100}ms` }}>
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6">
                    <Icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-3">{group.title}</h3>
                  <p className="text-slate-500 mb-8">{group.description}</p>
                  
                  <ul className="space-y-4">
                    {group.items.map((item, itemIdx) => (
                      <li key={itemIdx} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-slate-700 font-medium">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-12 text-center text-white reveal">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to upgrade your workflow?</h2>
            <p className="text-slate-300 mb-8 max-w-2xl mx-auto text-lg">
              Join 50+ real estate businesses managing over 50,000 leads on Estate Plus CRM.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button size="lg" className="bg-white text-slate-900 hover:bg-slate-100 h-14 px-8 text-base font-semibold rounded-xl" onClick={() => window.location.href = "/book-demo"}>
                Request a Demo <ChevronRight className="w-5 h-5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};

export default PublicFeaturesPage;
