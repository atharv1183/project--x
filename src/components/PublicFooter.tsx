import { Phone, Mail, MapPin, ShieldCheck, ChevronRight } from "lucide-react";

export const PublicFooter = () => {
  return (
    <footer className="bg-secondary text-secondary-foreground py-14">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-10">
        <div className="col-span-2 md:col-span-1">
          <div className="inline-flex items-center rounded-2xl bg-white px-3 py-2 mb-4 shadow-[0_12px_28px_rgba(0,0,0,0.22)] ring-1 ring-white/20">
            <span className="rounded-xl bg-gradient-to-br from-white via-emerald-50 to-white p-1.5">
              <img
                src="/logo.jpg"
                alt="Estate Plus"
                className="h-12 w-auto rounded-lg object-contain"
              />
            </span>
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
          <h4 className="font-bold mb-4 flex items-center gap-2 text-blue-400">
            <ShieldCheck className="w-5 h-5" /> LEGAL
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
                <ChevronRight className="w-4 h-4" /> Refund & Cancellation Policy
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
        <div>
          <h4 className="font-bold mb-4">Contact</h4>
          <ul className="space-y-3 text-sm text-white/60">
            <li className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary-glow" /> 8504899720</li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary-glow" />
              <a href="mailto:growth@estatepluscrm.in" className="hover:text-white transition">growth@estatepluscrm.in</a>
            </li>
            <li className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary-glow" /> India</li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 mt-10 pt-6 border-t border-white/10 text-xs text-white/50 text-center">
        © {new Date().getFullYear()} Estate Plus. All rights reserved.
      </div>
    </footer>
  );
};
