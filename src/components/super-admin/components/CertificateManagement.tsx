import { useState, useEffect, FormEvent } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Certificate, User } from '../../../types';
import { Trash2, Edit, Plus, Image as ImageIcon, X } from 'lucide-react';

const uploadToCloudinary = async (file: File, folder: string) => {
  const cloudName = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '').trim();
  const uploadPreset = String(import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim();
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
  }

  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', uploadPreset);
  body.append('folder', folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body,
  });
  const result = await response.json().catch(() => null) as { secure_url?: string; error?: { message?: string } } | null;
  if (!response.ok || !result?.secure_url) {
    throw new Error(result?.error?.message || `Cloudinary upload failed with status ${response.status}.`);
  }

  return result.secure_url;
};

type Props = {
  user: User;
};

const INITIAL_FORM = {
  documentNumber: '',
  name: '',
  photoUrl: '',
  startDate: '',
  endDate: '',
};

export function CertificateManagement({ user }: Props) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'certificates'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCertificates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Certificate)));
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.documentNumber.trim() || !form.name.trim() || !form.startDate || !form.endDate) {
      return alert('Document number, name, start date, and end date are required.');
    }

    setSaving(true);
    try {
      let finalPhotoUrl = form.photoUrl;
      if (file) {
        finalPhotoUrl = await uploadToCloudinary(file, 'certificates');
      }

      if (editingId) {
        await updateDoc(doc(db, 'certificates', editingId), {
          documentNumber: form.documentNumber.trim(),
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          ...(finalPhotoUrl ? { photoUrl: finalPhotoUrl } : {}),
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'certificates'), {
          documentNumber: form.documentNumber.trim(),
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          photoUrl: finalPhotoUrl,
          addedByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setIsAdding(false);
      setEditingId(null);
      setForm(INITIAL_FORM);
      setFile(null);
    } catch (error: any) {
      alert(error.message || 'Failed to save certificate.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (cert: Certificate) => {
    setForm({
      documentNumber: cert.documentNumber,
      name: cert.name,
      photoUrl: cert.photoUrl || '',
      startDate: cert.startDate,
      endDate: cert.endDate,
    });
    setEditingId(cert.id);
    setIsAdding(true);
    setFile(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this certificate?')) return;
    try {
      await deleteDoc(doc(db, 'certificates', id));
    } catch (error) {
      alert('Failed to delete certificate.');
    }
  };

  if (isAdding) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">{editingId ? 'Edit Certificate' : 'Add New Certificate'}</h2>
          <button onClick={() => { setIsAdding(false); setEditingId(null); setForm(INITIAL_FORM); }} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Document Number</label>
              <input
                type="text"
                value={form.documentNumber}
                onChange={(e) => setForm({ ...form, documentNumber: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Name (Intern / Employee)</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Photo</label>
            <div className="flex items-center gap-4">
              {form.photoUrl && !file && (
                <img src={form.photoUrl} alt="Photo" className="h-16 w-16 object-cover rounded-lg" />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
              />
            </div>
          </div>
          
          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Certificate'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Certificate Management</h2>
        <button
          onClick={() => { setForm(INITIAL_FORM); setEditingId(null); setIsAdding(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors text-sm"
        >
          <Plus className="w-4 h-4" /> Add Certificate
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Photo</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Doc Number</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {certificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    {cert.photoUrl ? (
                      <img src={cert.photoUrl} alt={cert.name} className="w-10 h-10 object-cover rounded-lg" />
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{cert.documentNumber}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900">{cert.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {cert.startDate} to {cert.endDate}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleEdit(cert)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(cert.id)} className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {certificates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">
                    No certificates found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
