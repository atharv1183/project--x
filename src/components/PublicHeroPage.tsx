import { useReveal } from "@/hooks/useReveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Building2, Users, BarChart3, Megaphone, Calendar, ClipboardList,
  CheckCircle2, XCircle, ArrowRight, Sparkles, Rocket, Shield,
  Smartphone, LineChart, Target, Handshake, MapPin, Phone, Mail,
} from "lucide-react";
import heroImg from "@/assets/hero-illustration.png";
import growthImg from "@/assets/growth-illustration.png";

const stats = [
  { label: "Leads Managed", value: "50,000+", icon: Users },
  { label: "Activities Tracked", value: "2,00,000+", icon: BarChart3 },
  { label: "Enterprises Deployed", value: "10+", icon: Building2 },
  { label: "Daily Follow-Ups", value: "5,000+", icon: ClipboardList },
  { label: "Uptime SLA", value: "99.9%", icon: Shield },
];

const features = [
  { icon: Users, title: "CRM Infrastructure", desc: "Centralized lead capture, qualification and conversion tracking." },
  { icon: Building2, title: "Inventory Management", desc: "Organize projects, units and availability in real time." },
  { icon: Megaphone, title: "Marketing Integration", desc: "Run Meta campaigns and sync leads directly into the CRM." },
  { icon: Rocket, title: "Automation Systems", desc: "Workflows for follow-ups, assignment and notifications." },
  { icon: LineChart, title: "Reporting Dashboards", desc: "Live visibility into pipeline, team and revenue health." },
  { icon: Target, title: "Lead Management", desc: "Distribute, score and nurture leads through every stage." },
  { icon: Handshake, title: "Team Coordination", desc: "Multi-user roles, permissions and shared inventory." },
  { icon: Calendar, title: "Follow-Up Tracking", desc: "Structured follow-up workflows so nothing slips." },
];

const beforeAfter = {
  before: [
    "Leads scattered across WhatsApp and notebooks",
    "Manual follow-ups and missed calls",
    "No visibility on team performance",
    "Unorganized inventory systems",
    "Delayed reporting and coordination",
    "Operations dependent on individuals",
  ],
  after: [
    "Centralized cloud-based operations",
    "Structured lead workflows",
    "Real-time activity visibility",
    "Organized inventory management",
    "Faster reporting & monitoring",
    "Process-driven business growth",
  ],
};

const useCases = [
  { icon: Building2, title: "Builders & Developers", desc: "Manage projects, inventories, campaigns and customer pipelines from one centralized system." },
  { icon: Handshake, title: "Channel Partners", desc: "Coordinate broker networks, share inventories and distribute leads efficiently across stakeholders." },
  { icon: Users, title: "Real Estate Agencies", desc: "Multi-user sales operations with structured workflows and performance monitoring." },
];

const plans = [
  {
    name: "Estate Plus Core",
    tagline: "CRM & Operational Management Suite",
    price: { q: "₹24,000", h: "₹33,000", y: "₹60,000" },
    features: [
      "Complete CRM Access", "Inventory Management", "Site Visit Tracking",
      "Mobile-Friendly Dashboard", "User Roles & Permissions",
      "Unlimited Team Members", "Broker Management", "Attendance Monitoring",
      "Reporting & Analytics", "Technical Support",
    ],
    featured: false,
  },
  {
    name: "Estate Plus GrowthX",
    tagline: "CRM + Performance Marketing Ecosystem",
    price: { q: "₹64,000", h: "₹93,000", y: "₹1,80,000" },
    features: [
      "Everything in Core, plus:",
      "Meta Lead Campaign Management", "Lead Funnel Setup",
      "Dedicated Account Assistance", "Creative Poster Support",
      "CRM Lead Auto Integration", "Monthly Performance Report",
      "Promotional Video Creatives", "Campaign Tracking Dashboard",
      "Growth Consultation",
    ],
    featured: true,
  },
];

const Index = () => {
  useReveal();

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* NAV */}
      <header className="fixed top-0 inset-x-0 z-50 glass">
        <nav className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <a href="#top" className="flex items-center gap-2 font-bold text-lg">
            <div className="w-9 h-9 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-glow">
              <Building2 className="w-5 h-5" />
            </div>
            <span>Estate<span className="text-primary">Plus</span></span>
          </a>
          <div className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-primary transition">Features</a>
            <a href="#stats" className="hover:text-primary transition">Impact</a>
            <a href="#usecases" className="hover:text-primary transition">Use Cases</a>
            <a href="#pricing" className="hover:text-primary transition">Pricing</a>
          </div>
          <Button className="bg-gradient-primary hover:opacity-90 shadow-elegant" onClick={() => { window.location.href = "/login"; }}>
            Login
          </Button>
        </nav>
      </header>

      {/* HERO */}
      <section id="top" className="relative pt-32 pb-24 bg-gradient-soft overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-float" />
        <div className="absolute bottom-0 -left-20 w-96 h-96 rounded-full bg-accent/20 blur-3xl animate-float" style={{ animationDelay: "2s" }} />

        <div className="relative max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="reveal inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm font-medium text-primary mb-6">
              <Sparkles className="w-4 h-4" /> Automation & Performance Marketing
            </div>
            <h1 className="reveal-blur text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-6">
              Simplifying <span className="gradient-text">Real Estate</span> Operations through Technology
            </h1>
            <p className="reveal text-lg text-muted-foreground mb-8 max-w-xl" style={{ transitionDelay: "120ms" }}>
              A modern operating ecosystem for brokers, builders, channel partners and enterprises — from lead management to marketing automation in one place.
            </p>
            <div className="reveal flex flex-wrap gap-4" style={{ transitionDelay: "240ms" }}>
              <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-elegant text-base h-12 px-7">
                Book a Free Demo <ArrowRight className="ml-1" />
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-7 text-base border-2">
                Explore Plans
              </Button>
            </div>
            <div className="reveal flex items-center gap-8 mt-10 text-sm text-muted-foreground" style={{ transitionDelay: "360ms" }}>
              <div><div className="text-2xl font-bold text-foreground">50K+</div>Leads</div>
              <div className="h-10 w-px bg-border" />
              <div><div className="text-2xl font-bold text-foreground">99.9%</div>Uptime</div>
              <div className="h-10 w-px bg-border" />
              <div><div className="text-2xl font-bold text-foreground">10+</div>Enterprises</div>
            </div>
          </div>

          <div className="reveal-scale relative">
            <div className="absolute inset-0 bg-gradient-primary blur-3xl opacity-20 rounded-full" />
            <img src={heroImg} alt="Estate Plus real estate platform" width={1024} height={1024} className="relative w-full max-w-lg mx-auto animate-float" />
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="border-y bg-secondary text-secondary-foreground py-6 overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-12 px-6 text-sm font-medium uppercase tracking-widest">
              {["CRM", "•", "Lead Management", "•", "Inventory", "•", "Meta Campaigns", "•", "Site Visits", "•", "Reporting", "•", "Automation", "•", "Team Coordination", "•"].map((t, j) => (
                <span key={j} className={t === "•" ? "text-accent" : ""}>{t}</span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section className="py-28 relative">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <p className="reveal text-sm font-semibold uppercase tracking-widest text-primary mb-4">About Estate Plus</p>
          <h2 className="reveal-blur text-4xl md:text-6xl font-bold mb-6">
            More than a CRM — a complete <span className="gradient-text">growth infrastructure</span>
          </h2>
          <p className="reveal text-lg text-muted-foreground max-w-3xl mx-auto" style={{ transitionDelay: "120ms" }}>
            Estate Plus is a complete operational ecosystem built to solve the real challenges faced by modern real estate businesses — combining CRM, marketing, automation and reporting into one centralized platform.
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 bg-muted/40 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="reveal text-sm font-semibold uppercase tracking-widest text-primary mb-3">Capabilities</p>
            <h2 className="reveal-blur text-4xl md:text-5xl font-bold">Everything you need, beautifully unified</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 stagger">
            {features.map((f, i) => (
              <Card
                key={f.title}
                style={{ ["--i" as any]: i }}
                className="reveal group p-6 hover:shadow-elegant transition-all duration-500 hover:-translate-y-2 border-2 hover:border-primary/40 bg-card"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground mb-4 group-hover:scale-110 group-hover:rotate-6 transition-transform">
                  <f.icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section id="stats" className="py-28 bg-gradient-hero text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="absolute top-10 right-10 w-72 h-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <div className="reveal-left">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent mb-3">Performance</p>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Built for scale, trusted by enterprises
            </h2>
            <p className="text-white/70 text-lg mb-8">
              Numbers that show what process-driven real estate operations can do.
            </p>
            <img src={growthImg} alt="Growth analytics" width={1024} height={800} loading="lazy" className="w-full max-w-md" />
          </div>
          <div className="grid grid-cols-2 gap-5 stagger">
            {stats.map((s, i) => (
              <div
                key={s.label}
                style={{ ["--i" as any]: i }}
                className="reveal-right p-6 rounded-2xl glass-dark hover:bg-primary/20 transition-all duration-500 hover:-translate-y-1"
              >
                <s.icon className="w-7 h-7 text-accent mb-4" />
                <div className="text-3xl md:text-4xl font-bold gradient-text mb-1">{s.value}</div>
                <div className="text-sm text-white/70">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section className="py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="reveal text-sm font-semibold uppercase tracking-widest text-primary mb-3">Transformation</p>
            <h2 className="reveal-blur text-4xl md:text-5xl font-bold">The Estate Plus difference</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="reveal-left p-8 border-2 border-destructive/20 bg-destructive/5">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-destructive/15 grid place-items-center">
                  <XCircle className="w-5 h-5 text-destructive" />
                </div>
                <h3 className="text-2xl font-bold">Before</h3>
              </div>
              <ul className="space-y-4">
                {beforeAfter.before.map((b) => (
                  <li key={b} className="flex gap-3 text-muted-foreground">
                    <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" /> {b}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="reveal-right p-8 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 shadow-elegant">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/15 grid place-items-center">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-2xl font-bold">After</h3>
              </div>
              <ul className="space-y-4">
                {beforeAfter.after.map((a) => (
                  <li key={a} className="flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" /> {a}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section id="usecases" className="py-28 bg-muted/40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="reveal text-sm font-semibold uppercase tracking-widest text-primary mb-3">Who it's for</p>
            <h2 className="reveal-blur text-4xl md:text-5xl font-bold">Built for every player in real estate</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 stagger">
            {useCases.map((u, i) => (
              <Card
                key={u.title}
                style={{ ["--i" as any]: i }}
                className="reveal-scale group relative overflow-hidden p-8 border-2 hover:border-primary/40 hover:shadow-elegant transition-all duration-500 hover:-translate-y-2"
              >
                <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-gradient-primary opacity-10 group-hover:scale-150 transition-transform duration-700" />
                <u.icon className="w-12 h-12 text-primary mb-5 group-hover:scale-110 transition" />
                <h3 className="text-xl font-bold mb-3">{u.title}</h3>
                <p className="text-muted-foreground">{u.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-28 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="reveal text-sm font-semibold uppercase tracking-widest text-primary mb-3">Pricing</p>
            <h2 className="reveal-blur text-4xl md:text-5xl font-bold">Choose the plan that fits</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {plans.map((p, i) => (
              <Card
                key={p.name}
                style={{ ["--i" as any]: i }}
                className={`reveal relative p-8 border-2 transition-all duration-500 hover:-translate-y-2 ${
                  p.featured
                    ? "border-primary bg-gradient-to-br from-primary/5 to-accent/10 shadow-elegant"
                    : "hover:border-primary/40 hover:shadow-card"
                }`}
              >
                {p.featured && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-accent text-accent-foreground text-xs font-bold uppercase tracking-wider shadow-glow">
                    Most Popular
                  </div>
                )}
                <h3 className="text-2xl font-bold mb-1">{p.name}</h3>
                <p className="text-sm text-muted-foreground mb-6">{p.tagline}</p>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {[
                    { label: "Quarterly", value: p.price.q },
                    { label: "Half-Yearly", value: p.price.h },
                    { label: "Annually", value: p.price.y, hl: true },
                  ].map((t) => (
                    <div key={t.label} className={`rounded-xl p-3 text-center ${t.hl ? "bg-gradient-primary text-primary-foreground" : "bg-muted"}`}>
                      <div className="text-xs opacity-80">{t.label}</div>
                      <div className="font-bold text-sm md:text-base">{t.value}</div>
                    </div>
                  ))}
                </div>
                <ul className="space-y-3 mb-8">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-3 text-sm">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  size="lg"
                  className={`w-full ${p.featured ? "bg-gradient-primary hover:opacity-90 shadow-elegant" : ""}`}
                  variant={p.featured ? "default" : "outline"}
                >
                  Get Started <ArrowRight />
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative">
        <div className="max-w-5xl mx-auto px-6">
          <div className="reveal-scale relative overflow-hidden rounded-3xl bg-gradient-hero text-white p-12 md:p-16 text-center shadow-elegant">
            <div className="absolute inset-0 bg-grid opacity-10" />
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-accent/30 blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-primary/40 blur-3xl" />
            <div className="relative">
              <Smartphone className="w-12 h-12 text-accent mx-auto mb-6" />
              <h2 className="text-3xl md:text-5xl font-bold mb-4">Ready to transform your real estate business?</h2>
              <p className="text-white/70 text-lg mb-8 max-w-2xl mx-auto">
                Join enterprises scaling with structure, visibility and accountability.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button size="lg" className="bg-gradient-accent text-accent-foreground hover:opacity-90 h-12 px-8 text-base font-bold">
                  Book a Free Demo <ArrowRight />
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-8 text-base border-white/30 bg-white/10 text-white hover:bg-white/20">
                  Contact Sales
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-secondary text-secondary-foreground py-14">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-2 font-bold text-lg mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-primary grid place-items-center">
                <Building2 className="w-5 h-5" />
              </div>
              <span>Estate<span className="text-primary-glow">Plus</span></span>
            </div>
            <p className="text-sm text-white/60">Simplifying Real Estate Operations through Technology.</p>
          </div>
          <div>
            <h4 className="font-bold mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-white/60">
              <li>Core CRM</li><li>GrowthX</li><li>Inventory</li><li>Reporting</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-white/60">
              <li>About</li><li>Use Cases</li><li>Contact</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4">Contact</h4>
            <ul className="space-y-3 text-sm text-white/60">
              <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary-glow" /> +91 00000 00000</li>
              <li className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary-glow" /> hello@estateplus.io</li>
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary-glow" /> India</li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-xs text-white/50 text-center">
          © {new Date().getFullYear()} Estate Plus. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Index;
