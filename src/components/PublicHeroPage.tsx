import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { motion } from 'motion/react';
import { MapPin, Building2, Sparkles } from 'lucide-react';
import { db } from '../lib/firebase';
import { InventoryItem } from '../types';

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === 'function') {
      const parsed = maybeTimestamp.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : 0;
    }
    if (typeof maybeTimestamp.seconds === 'number') return maybeTimestamp.seconds * 1000;
  }
  return 0;
}

function getAreaText(item: InventoryItem): string {
  if (typeof item.areaValue === 'number' && item.areaUnit) {
    return `${item.areaValue.toLocaleString()} ${item.areaUnit}`;
  }
  if (typeof item.areaSqft === 'number' && item.areaSqft > 0) return `${item.areaSqft.toLocaleString()} sqft`;
  return 'Area on request';
}

export default function PublicHeroPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const targetClientId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('clientId') || '').trim();
  }, []);

  useEffect(() => {
    const q = targetClientId
      ? query(collection(db, 'inventory'), where('visibilityScope', '==', 'all'), where('clientId', '==', targetClientId))
      : query(collection(db, 'inventory'), where('visibilityScope', '==', 'all'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const visible = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as InventoryItem))
          .filter((item) => item.status === 'approved' && Boolean((item as any).clientId))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setItems(visible);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsubscribe();
  }, [targetClientId]);

  const featured = useMemo(() => items.slice(0, 6), [items]);

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,#fef3c7_0%,transparent_35%),radial-gradient(circle_at_90%_20%,#dbeafe_0%,transparent_32%),linear-gradient(180deg,#fffdf7_0%,#ffffff_50%,#f8fafc_100%)] text-slate-900"
      style={{ fontFamily: '"Poppins","Segoe UI",sans-serif' }}
    >
      <main className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-3xl border border-amber-100/60 bg-white/85 p-8 sm:p-12 shadow-[0_24px_90px_-48px_rgba(15,23,42,0.45)] backdrop-blur"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-amber-100/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            <Sparkles size={14} /> Handpicked Listings
          </div>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            Discover Homes and Projects Built for Modern Living
          </h1>
          <p className="mt-4 max-w-2xl text-sm text-slate-600 sm:text-base">
            Browse premium properties, transparent pricing, and locations that match your lifestyle.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#listings"
              className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Explore Properties
            </a>
            <span className="text-sm font-medium text-slate-500">
              {items.length} live listings available
            </span>
          </div>
          <div className="mt-8">
            <a
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 sm:w-auto sm:min-w-[280px]"
            >
              Continue to Login
            </a>
          </div>
        </motion.section>

        <section id="listings" className="mt-12 sm:mt-16">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold sm:text-2xl">Featured Inventory</h2>
            {!loading && <span className="text-sm text-slate-500">{featured.length} shown</span>}
          </div>

          {loading ? (
            <div className="rounded-3xl border border-slate-200 bg-white/80 px-6 py-16 text-center text-sm font-medium text-slate-500">
              Loading listings...
            </div>
          ) : featured.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white/80 px-6 py-16 text-center text-sm font-medium text-slate-500">
              No public listings available yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((item, idx) => (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="h-44 w-full overflow-hidden bg-slate-100">
                    {item.photos?.[0] ? (
                      <img src={item.photos[0]} alt={item.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-slate-300">
                        <Building2 size={42} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-5">
                    <h3 className="line-clamp-2 text-lg font-semibold">{item.title}</h3>
                    <p className="flex items-center gap-1.5 text-sm text-slate-500">
                      <MapPin size={14} className="text-sky-600" /> {item.location}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="rounded-xl bg-amber-100 px-3 py-1 font-semibold text-amber-700">
                        {item.type}
                      </span>
                      <span className="font-medium text-slate-600">{getAreaText(item)}</span>
                    </div>
                    <p className="text-xl font-semibold text-slate-900">
                      Rs. {Number(item.rate || 0).toLocaleString()}
                    </p>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

