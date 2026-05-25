import { FormEvent } from 'react';
import { EditClientFormState } from '../types';

type EditClientPanelProps = {
  form: EditClientFormState;
  onChange: (patch: Partial<EditClientFormState>) => void;
  onSave: (e: FormEvent) => void;
  onCancel: () => void;
  onDelete: () => void;
};

export function EditClientPanel({ form, onChange, onSave, onCancel, onDelete }: EditClientPanelProps) {
  return (
    <form onSubmit={onSave} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3 border border-gray-200 rounded-xl p-4">
      <input required value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Company Name" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
      <input value={form.contactPerson} onChange={(e) => onChange({ contactPerson: e.target.value })} placeholder="Person Name" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
      <input value={form.mobileNumber} onChange={(e) => onChange({ mobileNumber: e.target.value })} placeholder="Contact Number" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
      <input type="email" value={form.email} onChange={(e) => onChange({ email: e.target.value })} placeholder="Email" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
      <input value={form.address} onChange={(e) => onChange({ address: e.target.value })} placeholder="Address" className="px-3 py-2 border border-gray-200 rounded-xl text-sm md:col-span-2" />
      <input value={form.gstn} onChange={(e) => onChange({ gstn: e.target.value })} placeholder="GSTN" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
      <select value={form.state} onChange={(e) => onChange({ state: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-xl text-sm">
        <option value="trial">Trial</option>
        <option value="active">Active</option>
        <option value="suspended">Grace Period</option>
        <option value="expired">Expired</option>
      </select>
      <input value={form.trialDays} onChange={(e) => onChange({ trialDays: e.target.value })} placeholder="Trial Days" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
      <input type="date" value={form.subscriptionExpiryDate} onChange={(e) => onChange({ subscriptionExpiryDate: e.target.value })} className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
      <div className="md:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onDelete} className="px-4 py-2 rounded-xl border border-rose-300 text-sm font-semibold text-rose-700">Delete Company</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold">Save Changes</button>
      </div>
    </form>
  );
}
