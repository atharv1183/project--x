import { FormEvent } from 'react';
import { AddClientFormState } from '../types';

type AddClientFormProps = {
  form: AddClientFormState;
  saving: boolean;
  onChange: (patch: Partial<AddClientFormState>) => void;
  onSubmit: (e: FormEvent) => void;
};

export function AddClientForm({ form, saving, onChange, onSubmit }: AddClientFormProps) {
  return (
    <div>
      <h3 className="text-xl font-black text-gray-900">Add Client</h3>
      <p className="text-sm text-gray-500 mt-2">Fill details and Save to start Trial automatically.</p>
      <form onSubmit={onSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2 rounded-xl border border-gray-200 p-3">
          <label className="block text-xs font-black uppercase tracking-widest text-gray-500">Company Logo</label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
            {form.companyLogoUrl ? (
              <img src={form.companyLogoUrl} alt="Company logo preview" className="h-14 w-14 rounded-lg border border-gray-100 object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs font-bold text-gray-400">Logo</div>
            )}
            <div className="flex-1">
              <input
                type="file"
                accept="image/*"
                disabled={saving}
                onChange={(e) => onChange({ companyLogoFile: e.target.files?.[0] || null })}
                className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-blue-700 disabled:opacity-60"
              />
              <p className="mt-1 text-xs text-gray-500">{form.companyLogoFile?.name || 'Upload JPG, PNG, or WebP.'}</p>
            </div>
          </div>
        </div>
        <input required value={form.companyName} onChange={(e) => onChange({ companyName: e.target.value })} placeholder="Company Name" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        <input required value={form.personName} onChange={(e) => onChange({ personName: e.target.value })} placeholder="Person Name" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        <input required value={form.contactNumber} onChange={(e) => onChange({ contactNumber: e.target.value })} placeholder="Contact Number" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        <input required type="email" value={form.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="Email" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        <input value={form.address} onChange={(e) => onChange({ address: e.target.value })} placeholder="Address" className="px-3 py-2 border border-gray-200 rounded-xl text-sm md:col-span-2" />
        <input value={form.gstn} onChange={(e) => onChange({ gstn: e.target.value })} placeholder="GSTN" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
        <div className="md:col-span-2 flex justify-end">
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
