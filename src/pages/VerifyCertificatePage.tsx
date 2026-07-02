import { useState, FormEvent } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Certificate } from '../types';
import { Award, Search, CheckCircle, XCircle } from 'lucide-react';
import { PublicHeader } from '../components/PublicHeader';
import { PublicFooter } from '../components/PublicFooter';

export default function VerifyCertificatePage() {
  const [docNumber, setDocNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Certificate | null | 'not_found'>(null);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!docNumber.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const q = query(collection(db, 'certificates'), where('documentNumber', '==', docNumber.trim()), limit(1));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setResult('not_found');
      } else {
        const cert = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Certificate;
        setResult(cert);
      }
    } catch (error) {
      console.error('Error verifying certificate:', error);
      alert('Something went wrong while verifying. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PublicHeader />
      
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-20 flex flex-col items-center">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
          <Award className="w-8 h-8" />
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight text-center mb-4">
          Verify Certificate
        </h1>
        <p className="text-lg text-gray-600 text-center max-w-2xl mb-10">
          Enter the certificate document number below to verify its authenticity.
        </p>

        <form onSubmit={handleSearch} className="w-full max-w-lg mb-12">
          <div className="relative flex items-center">
            <Search className="absolute left-4 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="e.g. EP-INT-2026-001"
              className="w-full pl-12 pr-32 py-4 bg-white border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 text-lg"
              required
            />
            <button
              type="submit"
              disabled={loading || !docNumber.trim()}
              className="absolute right-2 top-2 bottom-2 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Verify'}
            </button>
          </div>
        </form>

        {result === 'not_found' && (
          <div className="w-full max-w-lg bg-white border border-rose-100 rounded-2xl shadow-sm p-8 text-center animate-in fade-in slide-in-from-bottom-4">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Certificate Not Found</h3>
            <p className="text-gray-600">
              We couldn't find any certificate matching "{docNumber}". Please check the number and try again.
            </p>
          </div>
        )}

        {result && result !== 'not_found' && (
          <div className="w-full max-w-lg bg-white border border-emerald-100 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-emerald-50 border-b border-emerald-100 p-6 flex flex-col items-center justify-center text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
              <h3 className="text-2xl font-black text-emerald-900">Verified Certificate</h3>
              <p className="text-emerald-700 font-medium">{result.documentNumber}</p>
            </div>
            
            <div className="p-6 md:p-8">
              <div className="flex flex-col items-center mb-8">
                {result.photoUrl ? (
                  <img src={result.photoUrl} alt={result.name} className="w-32 h-32 object-cover rounded-full border-4 border-white shadow-lg mb-4" />
                ) : (
                  <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center border-4 border-white shadow-lg mb-4 text-3xl font-bold text-gray-400">
                    {result.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <h4 className="text-2xl font-bold text-gray-900 text-center">{result.name}</h4>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Start Date</p>
                  <p className="text-sm font-medium text-gray-900">{result.startDate}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">End Date</p>
                  <p className="text-sm font-medium text-gray-900">{result.endDate}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
