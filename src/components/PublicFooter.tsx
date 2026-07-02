import { Phone, Mail, MapPin, ShieldCheck, ChevronRight } from "lucide-react";

const reviewPlatforms = [
  {
    name: "Trustpilot",
    url: "https://www.trustpilot.com/evaluate/estatepluscrm.in",
    logo: "https://cdn.worldvectorlogo.com/logos/trustpilot-1.svg",
    color: "#00B67A",
  },
  {
    name: "G2",
    url: "https://www.g2.com/products/estate-plus-crm/reviews?source=search",
    logo: "https://cdn.worldvectorlogo.com/logos/g2-1.svg",
    color: "#FF492C",
  },
  {
    name: "Capterra",
    url: "https://reviews.capterra.com/products/new/9191780e-3acc-4047-ae66-d0630229b755/",
    logo: "https://cdn.worldvectorlogo.com/logos/capterra-2.svg",
    color: "#FF7043",
  },
  {
    name: "Product Hunt",
    url: "https://www.producthunt.com/products/estatepluscrm",
    logo: "https://cdn.worldvectorlogo.com/logos/product-hunt.svg",
    color: "#DA552F",
  },
  {
    name: "SourceForge",
    url: "https://sourceforge.net/software/product/Estate-Plus/reviews/new",
    logo: "https://a.fsdn.com/con/img/sandiego/svg/originals/sf-icon-orange-no_default.svg",
    color: "#F76B1C",
  },
  {
    name: "SoftwareSuggest",
    url: "https://www.softwaresuggest.com/estate-plus/write-review",
    logo: "https://www.softwaresuggest.com/img/ss-logo-icon.png",
    color: "#7C3AED",
  },
  {
    name: "Startup Ranking",
    url: "https://www.startupranking.com/startup/estate-plus-crm",
    logo: "https://www.startupranking.com/favicon.ico",
    color: "#2563EB",
  },
  {
    name: "Google Maps",
    url: "https://g.page/r/CWer9JIWGQWAEBM/review",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/272px-Google_2015_logo.svg.png",
    color: "#4285F4",
  },
];

export const PublicFooter = () => {
  return (
    <footer className="bg-secondary text-secondary-foreground">

      {/* ── Review Platforms Strip ── */}
      <div className="border-b border-white/10 py-5">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4 text-center">
            Listed &amp; Recognised On
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {reviewPlatforms.map((p) => (
              <a
                key={p.name}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                title={p.name}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/25 transition-all rounded-xl px-4 py-2.5 group"
              >
                <img
                  src={p.logo}
                  alt={p.name}
                  className="h-5 w-auto object-contain opacity-80 group-hover:opacity-100 transition-opacity"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                <span className="text-xs font-semibold text-white/60 group-hover:text-white transition-colors whitespace-nowrap">
                  {p.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Footer Grid ── */}
      <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-10">

        {/* Brand + Social + Address */}
        <div className="col-span-2 md:col-span-3 lg:col-span-2 space-y-6">
          {/* Logo */}
          <div className="inline-flex items-center rounded-2xl bg-white px-3 py-2 shadow-[0_12px_28px_rgba(0,0,0,0.22)] ring-1 ring-white/20 shrink-0">
            <span className="rounded-xl bg-gradient-to-br from-white via-emerald-50 to-white p-1.5 shrink-0 flex items-center justify-center">
              <img
                src="/logo.jpg"
                alt="Estate Plus CRM"
                className="h-14 w-auto min-w-[120px] rounded-lg object-contain shrink-0"
              />
            </span>
          </div>
          <p className="text-sm text-white/60 max-w-xs">
            Simplifying Real Estate Operations through Technology.
          </p>

          {/* Follow Us On */}
          <div>
            <h5 className="text-sm font-bold mb-3 text-white/80">Follow Us On</h5>
            <div className="flex items-center gap-3">
              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/company/estate-plus-crm/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="w-10 h-10 rounded-full bg-[#0A66C2] flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </a>
              {/* Instagram */}
              <a
                href="https://www.instagram.com/estatepluscrm/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
                style={{ background: "radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)" }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
              </a>
              {/* YouTube */}
              <a
                href="https://www.youtube.com/@EstatePlusCRM"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="w-10 h-10 rounded-full bg-[#FF0000] flex items-center justify-center hover:scale-110 transition-transform shadow-lg"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Address */}
          <div>
            <h5 className="text-sm font-bold mb-3 text-white/80 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary-glow" /> Address
            </h5>
            <address className="text-sm text-white/60 not-italic leading-relaxed">
              Estate Plus CRM<br />
              Plot No. 3, Samradhi Nagar II<br />
              Behind Arihant Hospital, Borkhera<br />
              Manpura, Kota – 324001<br />
              Rajasthan, India
            </address>
          </div>
        </div>

        {/* Product */}
        <div>
          <h4 className="font-bold mb-4">Product</h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li>Core CRM</li>
            <li>GrowthX</li>
            <li>Inventory</li>
            <li>Reporting</li>
          </ul>
        </div>

        {/* Company */}
        <div>
          <h4 className="font-bold mb-4">Company</h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li>
              <a href="/about" className="hover:text-white transition">About</a>
            </li>
            <li>Use Cases</li>
            <li>Contact</li>
          </ul>
        </div>

        {/* Careers */}
        <div>
          <h4 className="font-bold mb-4">Careers</h4>
          <ul className="space-y-2 text-sm text-white/60">
            <li>
              <a href="/verify-certificate" className="hover:text-white transition flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> Verify Certificate
              </a>
            </li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <h4 className="font-bold mb-4 flex items-center gap-2 text-blue-400">
            <ShieldCheck className="w-5 h-5" /> Legal
          </h4>
          <ul className="space-y-3 text-sm text-white/60">
            <li>
              <a href="/legal/privacy-policy" className="hover:text-white transition flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> Privacy Policy
              </a>
            </li>
            <li>
              <a href="/legal/terms-of-service" className="hover:text-white transition flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> Terms of Service
              </a>
            </li>
            <li>
              <a href="/legal/refund-cancellation" className="hover:text-white transition flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> Refund &amp; Cancellation
              </a>
            </li>
            <li>
              <a href="/legal/cookie-policy" className="hover:text-white transition flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> Cookie Policy
              </a>
            </li>
            <li>
              <a href="/legal/disclaimer" className="hover:text-white transition flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> Disclaimer
              </a>
            </li>
            <li>
              <a href="/legal/acceptable-use" className="hover:text-white transition flex items-center gap-2">
                <ChevronRight className="w-4 h-4" /> Acceptable Use Policy
              </a>
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h4 className="font-bold mb-4">Contact</h4>
          <ul className="space-y-3 text-sm text-white/60">
            <li className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary-glow shrink-0" />
              <a href="tel:+918504899720" className="hover:text-white transition">+91 85048 99720</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary-glow shrink-0" />
              <a href="mailto:growth@estatepluscrm.in" className="hover:text-white transition">growth@estatepluscrm.in</a>
            </li>
          </ul>
        </div>

      </div>

      {/* ── Bottom Bar ── */}
      <div className="max-w-7xl mx-auto px-6 pb-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
        <span>© {new Date().getFullYear()} Estate Plus CRM. All rights reserved.</span>
        <span>Made with ❤️ in Kota, Rajasthan, India</span>
      </div>
    </footer>
  );
};
