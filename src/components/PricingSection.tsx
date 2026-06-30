import { useState, useMemo } from "react";
import { CheckCircle2, Minus, Plus, ArrowRight, Zap, Rocket, Crown, Check, X } from "lucide-react";

// ── Constants ──────────────────────────────────────────────────────────────
const MONTHLY_RATE = 500;   // ₹ per user/month
const ANNUAL_RATE  = 449;   // ₹ per user/month (billed yearly)
const GST          = 0.18;

const QUICK_SEATS = [1, 3, 5, 10, 25];

const BUNDLES = [
  {
    id: "mini",
    name: "Mini",
    icon: Zap,
    seats: 3,
    annualPrice: 15000,
    ratePerUser: 417,
    tagline: "For tight-knit teams finding their rhythm.",
    popular: false,
  },
  {
    id: "growth",
    name: "Growth",
    icon: Rocket,
    seats: 5,
    annualPrice: 22500,
    ratePerUser: 375,
    tagline: "For teams shipping faster, every week.",
    popular: true,
  },
  {
    id: "growthx",
    name: "GrowthX",
    icon: Crown,
    seats: 10,
    annualPrice: 40000,
    ratePerUser: 333,
    tagline: "For scaling orgs that need more headroom.",
    popular: false,
  },
] as const;

const COMPARE_ROWS: { label: string; perUserMonthly: boolean; perUserAnnual: boolean; mini: boolean; growth: boolean; growthx: boolean }[] = [
  { label: "Included users",       perUserMonthly: true,  perUserAnnual: true,  mini: true,  growth: true,  growthx: true  },
  { label: "Add extra users",      perUserMonthly: true,  perUserAnnual: true,  mini: true,  growth: true,  growthx: true  },
  { label: "Priority support",     perUserMonthly: false, perUserAnnual: true,  mini: true,  growth: true,  growthx: true  },
  { label: "Dedicated onboarding", perUserMonthly: false, perUserAnnual: false, mini: false, growth: true,  growthx: true  },
  { label: "Custom integrations",  perUserMonthly: false, perUserAnnual: false, mini: false, growth: false, growthx: true  },
  { label: "SLA & account manager",perUserMonthly: false, perUserAnnual: false, mini: false, growth: false, growthx: true  },
];

function fmt(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

// ── Sub-components ─────────────────────────────────────────────────────────
function SummaryPanel({
  label, billing, subtotal, gstAmt, total, cta,
}: {
  label: string; billing: string; subtotal: number;
  gstAmt: number; total: number; cta: string;
}) {
  return (
    <div className="bg-[#0d1117] rounded-2xl p-7 text-white h-fit sticky top-24 shadow-2xl">
      <div className="flex justify-between items-start mb-5">
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">Your Plan</span>
        <span className="text-xs font-bold uppercase tracking-widest text-white/40">{billing}</span>
      </div>
      <div className="mb-1">
        <span className="text-5xl font-extrabold tracking-tight">{fmt(total)}</span>
      </div>
      <p className="text-sm text-white/40 mb-8">incl. 18% GST · {billing.toLowerCase()}</p>

      <div className="space-y-3 text-sm border-t border-white/10 pt-5 mb-6">
        <div className="flex justify-between">
          <span className="text-white/60">{label}</span>
          <span className="font-semibold">{fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/60">Subtotal</span>
          <span className="font-semibold">{fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/60">GST (18%)</span>
          <span className="font-semibold">{fmt(gstAmt)}</span>
        </div>
      </div>

      <button
        onClick={() => { window.location.href = "/book-demo"; }}
        className="w-full bg-white text-gray-900 font-bold py-3.5 rounded-xl hover:bg-gray-100 transition-colors text-sm mb-5"
      >
        Book Demo
      </button>

      <ul className="space-y-2 text-xs text-white/50">
        <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> Cancel anytime</li>
        <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> Priority support</li>
        <li className="flex gap-2"><Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" /> Free onboarding session</li>
      </ul>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export const PricingSection = () => {
  const [tab, setTab] = useState<"peruser" | "bundle">("peruser");

  // Per-user tab state
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [seats, setSeats]     = useState(1);

  // Bundle tab state
  const [selectedBundle, setSelectedBundle] = useState<"mini" | "growth" | "growthx">("growth");
  const [extraUsers, setExtraUsers] = useState(0);

  // ── Per-user calculations ──
  const ratePerMonth = billing === "monthly" ? MONTHLY_RATE : ANNUAL_RATE;
  const perUserSubtotal = useMemo(() => {
    if (billing === "monthly") return seats * MONTHLY_RATE;
    return seats * ANNUAL_RATE * 12;
  }, [seats, billing]);
  const perUserGst   = perUserSubtotal * GST;
  const perUserTotal = perUserSubtotal + perUserGst;

  const perUserSummaryLabel = billing === "monthly"
    ? `${seats} user${seats > 1 ? "s" : ""} × ₹${MONTHLY_RATE}/mo`
    : `${seats} user${seats > 1 ? "s" : ""} × ₹${ANNUAL_RATE}/mo × 12`;

  // ── Bundle calculations ──
  const bundle = BUNDLES.find(b => b.id === selectedBundle)!;
  const bundleExtra      = extraUsers * ANNUAL_RATE * 12;
  const bundleSubtotal   = bundle.annualPrice + bundleExtra;
  const bundleGst        = bundleSubtotal * GST;
  const bundleTotal      = bundleSubtotal + bundleGst;
  const bundleTotalSeats = bundle.seats + extraUsers;

  return (
    <section id="pricing" className="py-24 bg-gray-50/50 relative">
      <div className="max-w-7xl mx-auto px-6">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gray-200 bg-white text-gray-500 text-xs font-semibold uppercase tracking-widest mb-5 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-amber-500" /> Simple, transparent pricing
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-3">
            Pay for seats. <span className="text-gray-400">Not surprises.</span>
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto text-base">
            Pick a flexible per-user plan, or grab a bundle and add seats as your team grows.
          </p>
        </div>

        {/* Tab toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex bg-white border border-gray-200 rounded-full p-1 shadow-sm">
            <button
              onClick={() => setTab("peruser")}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                tab === "peruser" ? "bg-gray-900 text-white shadow" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Per user
            </button>
            <button
              onClick={() => setTab("bundle")}
              className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                tab === "bundle" ? "bg-gray-900 text-white shadow" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Team bundles
            </button>
          </div>
        </div>

        {/* ── TAB: PER USER ── */}
        {tab === "peruser" && (
          <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">

            {/* Left panel */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Build your plan</h3>
                  <p className="text-sm text-gray-400">Choose billing cycle and team size.</p>
                </div>
                {/* Billing toggle */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 self-start">
                  <button
                    onClick={() => setBilling("monthly")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      billing === "monthly" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setBilling("annual")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      billing === "annual" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Annually
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      billing === "annual" ? "bg-emerald-400 text-gray-900" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      save 10%
                    </span>
                  </button>
                </div>
              </div>

              {/* User slider */}
              <div className="bg-gray-50 rounded-xl p-5 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-semibold text-gray-700">Users</span>
                  <span className="text-xl font-extrabold text-gray-900">{seats}</span>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => setSeats(s => Math.max(1, s - 1))}
                    className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="range" min={1} max={50} value={seats}
                    onChange={(e) => setSeats(Number(e.target.value))}
                    className="flex-1 accent-gray-900 h-1.5 rounded-full cursor-pointer"
                  />
                  <button
                    onClick={() => setSeats(s => Math.min(50, s + 1))}
                    className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {/* Quick-select */}
                <div className="flex flex-wrap gap-2">
                  {QUICK_SEATS.map(n => (
                    <button
                      key={n}
                      onClick={() => setSeats(n)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        seats === n
                          ? "bg-gray-900 text-white border-gray-900"
                          : "border-gray-300 text-gray-600 hover:border-gray-500"
                      }`}
                    >
                      {n} {n === 1 ? "user" : "users"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate cards */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div
                  onClick={() => setBilling("monthly")}
                  className={`rounded-xl border-2 p-5 cursor-pointer transition-all ${
                    billing === "monthly" ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Monthly</p>
                  <p className="text-3xl font-extrabold text-gray-900">₹500</p>
                  <p className="text-xs text-gray-400 mt-1">per user / month + GST</p>
                </div>
                <div
                  onClick={() => setBilling("annual")}
                  className={`rounded-xl border-2 p-5 cursor-pointer transition-all relative ${
                    billing === "annual" ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="absolute top-3 right-3 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Best value</span>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Annual</p>
                  <p className="text-3xl font-extrabold text-gray-900">₹449</p>
                  <p className="text-xs text-gray-400 mt-1">per user / month, billed yearly + GST</p>
                </div>
              </div>
            </div>

            {/* Right: summary */}
            <SummaryPanel
              label={perUserSummaryLabel}
              billing={billing === "monthly" ? "MONTHLY" : "ANNUALLY"}
              subtotal={perUserSubtotal}
              gstAmt={perUserGst}
              total={perUserTotal}
              cta="Continue to checkout"
            />
          </div>
        )}

        {/* ── TAB: TEAM BUNDLES ── */}
        {tab === "bundle" && (
          <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">

            {/* Left: pick bundle */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-1">Pick a bundle</h3>
              <p className="text-sm text-gray-400 mb-6">Annual bundles with the <span className="text-blue-600 font-semibold">best per-seat value.</span></p>

              <div className="space-y-3 mb-8">
                {BUNDLES.map(b => {
                  const Icon = b.icon;
                  const active = selectedBundle === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBundle(b.id)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                        active ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{b.name}</span>
                          {b.popular && (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase">Popular</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{b.seats} users · ₹{b.ratePerUser}/user/mo · {b.tagline}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-extrabold text-gray-900">₹{b.annualPrice.toLocaleString("en-IN")}</div>
                        <div className="text-xs text-gray-400">+ GST / year</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Extra users */}
              <div className="bg-gray-50 rounded-xl p-5">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm">Add more users</h4>
                    <p className="text-xs text-gray-400">Billed at ₹449/user/month, annually.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setExtraUsers(n => Math.max(0, n - 1))}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-white transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-lg font-bold w-6 text-center">{extraUsers}</span>
                    <button
                      onClick={() => setExtraUsers(n => n + 1)}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-white transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-200">
                  <span className="text-sm font-semibold text-gray-600">Total seats</span>
                  <span className="text-lg font-extrabold text-gray-900">{bundleTotalSeats}</span>
                </div>
              </div>
            </div>

            {/* Right: summary */}
            <SummaryPanel
              label={`${bundle.name} bundle (${bundle.seats} users)${extraUsers > 0 ? ` + ${extraUsers} extra` : ""}`}
              billing="ANNUAL BUNDLE"
              subtotal={bundleSubtotal}
              gstAmt={bundleGst}
              total={bundleTotal}
              cta="Continue to checkout"
            />
          </div>
        )}

        {/* ── Compare Table ── */}
        <div className="mt-20">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Compare plans</h3>
              <p className="text-sm text-blue-600 font-medium">Live pricing updates as you change users and selection.</p>
            </div>
            <p className="text-xs text-blue-600 font-medium">Effective seats reflect your current configuration.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left p-5 text-xs font-bold uppercase tracking-wider text-gray-400 w-48">Features</th>
                  {/* Per User Monthly */}
                  <th className={`p-5 text-center ${tab === "peruser" && billing === "monthly" ? "bg-gray-900 text-white rounded-t-xl" : ""}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${tab === "peruser" && billing === "monthly" ? "text-white/60" : "text-gray-400"}`}>Per User</div>
                    <div className="font-bold">Monthly</div>
                    {tab === "peruser" && billing === "monthly" && (
                      <span className="text-[9px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">SELECTED</span>
                    )}
                    <div className={`text-xs mt-1 ${tab === "peruser" && billing === "monthly" ? "text-white/70" : "text-gray-500"}`}>
                      {fmt(seats * MONTHLY_RATE * 12)}/yr
                    </div>
                    <div className={`text-[10px] ${tab === "peruser" && billing === "monthly" ? "text-white/50" : "text-gray-400"}`}>
                      {seats} seat · ₹500/user/mo
                    </div>
                  </th>
                  {/* Per User Annual */}
                  <th className={`p-5 text-center ${tab === "peruser" && billing === "annual" ? "bg-gray-900 text-white rounded-t-xl" : ""}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${tab === "peruser" && billing === "annual" ? "text-white/60" : "text-gray-400"}`}>Per User</div>
                    <div className="font-bold">Annual</div>
                    {tab === "peruser" && billing === "annual" && (
                      <span className="text-[9px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">SELECTED</span>
                    )}
                    <div className={`text-xs mt-1 ${tab === "peruser" && billing === "annual" ? "text-white/70" : "text-gray-500"}`}>
                      {fmt(seats * ANNUAL_RATE * 12)}/yr
                    </div>
                    <div className={`text-[10px] ${tab === "peruser" && billing === "annual" ? "text-white/50" : "text-gray-400"}`}>
                      {seats} seat · ₹449/user/mo
                    </div>
                  </th>
                  {/* Bundles */}
                  {BUNDLES.map(b => (
                    <th key={b.id} className={`p-5 text-center ${tab === "bundle" && selectedBundle === b.id ? "bg-gray-900 text-white rounded-t-xl" : ""}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${tab === "bundle" && selectedBundle === b.id ? "text-white/60" : "text-gray-400"}`}>Bundle</div>
                      <div className="font-bold">{b.name}</div>
                      {tab === "bundle" && selectedBundle === b.id && (
                        <span className="text-[9px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold">SELECTED</span>
                      )}
                      <div className={`text-xs mt-1 ${tab === "bundle" && selectedBundle === b.id ? "text-white/70" : "text-gray-500"}`}>
                        ₹{b.annualPrice.toLocaleString("en-IN")}/yr
                      </div>
                      <div className={`text-[10px] ${tab === "bundle" && selectedBundle === b.id ? "text-white/50" : "text-gray-400"}`}>
                        {b.seats} seats · ₹{b.ratePerUser}/user/mo
                      </div>
                      <div className="mt-1">
                        <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                          Save ₹{Math.round((MONTHLY_RATE - b.ratePerUser) * b.seats * 12 / 1000)}k ({Math.round((MONTHLY_RATE - b.ratePerUser) / MONTHLY_RATE * 100)}%) vs monthly
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row, idx) => (
                  <tr key={row.label} className={idx % 2 === 0 ? "bg-gray-50/50" : ""}>
                    <td className="p-4 font-medium text-gray-700">{row.label}</td>
                    <td className="p-4 text-center">
                      {row.label === "Included users"
                        ? <span className="font-bold text-gray-700">1+</span>
                        : row.perUserMonthly
                        ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                        : <X className="w-4 h-4 text-gray-300 mx-auto" />}
                    </td>
                    <td className="p-4 text-center">
                      {row.label === "Included users"
                        ? <span className="font-bold text-gray-700">1+</span>
                        : row.label === "Billing cycle"
                        ? <span className="text-gray-500">Annual</span>
                        : row.perUserAnnual
                        ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                        : <X className="w-4 h-4 text-gray-300 mx-auto" />}
                    </td>
                    {BUNDLES.map(b => {
                      const val = row[b.id as "mini" | "growth" | "growthx"];
                      return (
                        <td key={b.id} className="p-4 text-center">
                          {row.label === "Included users"
                            ? <span className="font-bold text-gray-700">{b.seats}</span>
                            : val
                            ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                            : <X className="w-4 h-4 text-gray-300 mx-auto" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </section>
  );
};
