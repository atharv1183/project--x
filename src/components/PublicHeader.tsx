import { Button } from "@/components/ui/button";
import { ChevronDown, BarChart3, Users, Smartphone, ShieldCheck, ClipboardList, Building2, ArrowRight } from "lucide-react";

const featureGroups = [
  {
    title: "Sales CRM",
    icon: Users,
    items: ["Lead Capture", "Lead Assignment", "Follow-ups", "Deal Pipeline", "Lead Tracking"]
  },
  {
    title: "Inventory",
    icon: Building2,
    items: ["Projects", "Inventory", "Brochures", "Sharing", "Property Management"]
  },
  {
    title: "Team Management",
    icon: ClipboardList,
    items: ["Attendance", "Activity Tracking", "Goals", "Performance", "Leaderboards"]
  },
  {
    title: "Reports",
    icon: BarChart3,
    items: ["Lead Reports", "Sales Reports", "Conversion Reports", "Revenue Reports"]
  },
  {
    title: "Mobile App",
    icon: Smartphone,
    items: ["Lead Updates", "Inventory Access", "Mobile CRM"]
  },
  {
    title: "Support & Security",
    icon: ShieldCheck,
    items: ["Support Tickets", "Roles & Permissions", "Activity Logs", "Data Security"]
  }
];

export const PublicHeader = () => {
  return (
    <header className="fixed top-0 inset-x-0 z-50 glass">
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-6">
        <a href="/" className="flex items-center transition-transform duration-300 hover:-translate-y-0.5 py-4">
          <img
            src="/logo.jpg"
            alt="Estate Plus"
            className="h-14 w-auto rounded-lg object-contain brightness-125 contrast-125 saturate-150 drop-shadow-[0_10px_18px_rgba(16,185,129,0.18)]"
          />
        </a>
        
        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <a href="/#features" className="hover:text-primary transition py-6">Features</a>
          
          {/* Mega Menu Dropdown */}
          <div className="group relative">
            <button className="flex items-center gap-1 hover:text-primary transition py-6 focus:outline-none">
              Platform <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
            </button>
            
            {/* Mega Menu Content */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-[90vw] max-w-5xl bg-white rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 -mt-2 translate-y-2 group-hover:translate-y-0 overflow-hidden">
              <div className="p-8">
                <div className="flex justify-between items-end mb-6 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Platform Features</h3>
                    <p className="text-sm text-slate-500 mt-1">Everything you need to scale your real estate business.</p>
                  </div>
                  <a href="/features" className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-semibold text-sm transition-colors">
                    View All Features <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
                
                <div className="grid grid-cols-3 gap-x-8 gap-y-10">
                  {featureGroups.map((group, idx) => {
                    const Icon = group.icon;
                    return (
                      <div key={idx}>
                        <div className="flex items-center gap-2 mb-3 text-slate-900">
                          <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                            <Icon className="w-4 h-4" />
                          </div>
                          <h4 className="font-semibold">{group.title}</h4>
                        </div>
                        <ul className="space-y-2 pl-9">
                          {group.items.map((item, itemIdx) => (
                            <li key={itemIdx}>
                              <a href="/features" className="text-sm text-slate-500 hover:text-primary transition-colors block">
                                {item}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-slate-50 p-6 flex justify-between items-center border-t border-slate-100">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">We're Growing Fast!</span>
                  <span className="text-slate-600 ml-2">More features, integrations, and value coming your way.</span>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> 99.9% Uptime
                  </div>
                  <div className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <Users className="w-4 h-4 text-blue-500" /> 5000+ Leads Managed
                  </div>
                </div>
              </div>
            </div>
          </div>

          <a href="/#stats" className="hover:text-primary transition py-6">Impact</a>
          <a href="/#usecases" className="hover:text-primary transition py-6">Use Cases</a>
          <a href="/#pricing" className="hover:text-primary transition py-6">Pricing</a>
          <a href="/blogs" className="hover:text-primary transition py-6">Blogs</a>
        </div>
        
        <Button className="bg-gradient-primary hover:opacity-90 shadow-elegant" onClick={() => { window.location.href = "/login"; }}>
          Login
        </Button>
      </nav>
    </header>
  );
};
