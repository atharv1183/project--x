import { FormEvent, useEffect, useMemo, useState } from 'react';
import { addDoc, collection, query, where, getDocs, serverTimestamp, onSnapshot, orderBy, updateDoc, doc } from 'firebase/firestore';
import { Building2, ClipboardList, CreditCard, DatabaseBackup, LayoutDashboard, Repeat2, Ticket, TimerReset } from 'lucide-react';
import { User } from '../types';
import { db } from '../lib/firebase';

type Props = {
  user: User;
  onStartImpersonation: (payload: { clientId: string; clientName: string }) => Promise<void>;
};

type SuperAdminModule =
  | 'dashboard'
  | 'add_client'
  | 'status'
  | 'payments'
  | 'transactions'
  | 'followups'
  | 'tickets'
  | 'backup_restore';

const MODULES: Array<{ id: SuperAdminModule; label: string; icon: any }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'add_client', label: 'Add Client', icon: Building2 },
  { id: 'status', label: 'Status', icon: ClipboardList },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'transactions', label: 'Transactions', icon: Repeat2 },
  { id: 'followups', label: 'Followups', icon: TimerReset },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'backup_restore', label: 'Backup & Restore (Full Data)', icon: DatabaseBackup },
];

export default function SuperAdminControlCenter({ user }: Props) {
  const [module, setModule] = useState<SuperAdminModule>('dashboard');
  const [clients, setClients] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusSearch, setStatusSearch] = useState('');
  const [statusSort, setStatusSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingClientForm, setEditingClientForm] = useState({
    name: '',
    contactPerson: '',
    mobileNumber: '',
    email: '',
    address: '',
    gstn: '',
  });
  const [selectedPaymentClientId, setSelectedPaymentClientId] = useState<string>('');
  const [savingClient, setSavingClient] = useState(false);
  const [addClientForm, setAddClientForm] = useState({
    companyLogoUrl: '',
    companyName: '',
    personName: '',
    contactNumber: '',
    email: '',
    address: '',
    gstn: '',
  });

  useEffect(() => {
    const unsubClients = onSnapshot(query(collection(db, 'platformClients'), orderBy('name', 'asc')), (snapshot) => {
      setClients(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      setUsers(snapshot.docs.map((d) => ({ uid: d.id, ...d.data() } as User)));
    });
    return () => {
      unsubClients();
      unsubUsers();
    };
  }, []);

  const statusRows = useMemo(() => {
    const q = statusSearch.trim().toLowerCase();
    const filtered = clients.filter((client) => {
      if (!q) return true;
      return [client.name, client.contactPerson, client.mobileNumber, client.email, client.state]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    const compare = (a: any, b: any) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
    const rows = [...filtered];
    rows.sort((a, b) => {
      const aUsers = users.filter((u) => (u as any).clientId === a.id && u.role !== 'suspended' && u.role !== 'deleted').length;
      const bUsers = users.filter((u) => (u as any).clientId === b.id && u.role !== 'suspended' && u.role !== 'deleted').length;
      const aDays = a.subscriptionExpiryDate ? Math.ceil((new Date(a.subscriptionExpiryDate).getTime() - Date.now()) / 86400000) : Number.MAX_SAFE_INTEGER;
      const bDays = b.subscriptionExpiryDate ? Math.ceil((new Date(b.subscriptionExpiryDate).getTime() - Date.now()) / 86400000) : Number.MAX_SAFE_INTEGER;
      const mapA: Record<string, any> = {
        name: a.name,
        person: a.contactPerson,
        contact: a.mobileNumber,
        users: aUsers,
        payment: a.billingCycle || '-',
        status: a.state || 'trial',
        expiry: a.subscriptionExpiryDate || '',
        days: aDays,
      };
      const mapB: Record<string, any> = {
        name: b.name,
        person: b.contactPerson,
        contact: b.mobileNumber,
        users: bUsers,
        payment: b.billingCycle || '-',
        status: b.state || 'trial',
        expiry: b.subscriptionExpiryDate || '',
        days: bDays,
      };
      const result = typeof mapA[statusSort.key] === 'number'
        ? (mapA[statusSort.key] - mapB[statusSort.key])
        : compare(mapA[statusSort.key], mapB[statusSort.key]);
      return statusSort.dir === 'asc' ? result : -result;
    });
    return rows;
  }, [clients, statusSearch, statusSort, users]);

  const openEditClient = (client: any) => {
    setEditingClientId(client.id);
    setEditingClientForm({
      name: client.name || '',
      contactPerson: client.contactPerson || '',
      mobileNumber: client.mobileNumber || '',
      email: client.email || '',
      address: client.address || '',
      gstn: client.gstn || '',
    });
  };

  const saveEditedClient = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingClientId) return;
    await updateDoc(doc(db, 'platformClients', editingClientId), {
      name: editingClientForm.name.trim(),
      contactPerson: editingClientForm.contactPerson.trim(),
      mobileNumber: editingClientForm.mobileNumber.trim(),
      email: editingClientForm.email.trim().toLowerCase(),
      address: editingClientForm.address.trim(),
      gstn: editingClientForm.gstn.trim(),
      updatedAt: serverTimestamp(),
    });
    setEditingClientId(null);
  };

  const handleSaveClient = async (e: FormEvent) => {
    e.preventDefault();
    const companyName = addClientForm.companyName.trim();
    const personName = addClientForm.personName.trim();
    const contactNumber = addClientForm.contactNumber.replace(/\D/g, '');
    const email = addClientForm.email.trim().toLowerCase();

    if (!companyName) return alert('Company Name is required.');
    if (!personName) return alert('Person Name is required.');
    if (contactNumber.length < 10 || contactNumber.length > 15) return alert('Contact number must be 10 to 15 digits.');
    if (!email) return alert('Email is required.');

    setSavingClient(true);
    try {
      const existingCompanyByEmail = await getDocs(query(collection(db, 'platformClients'), where('email', '==', email)));
      if (!existingCompanyByEmail.empty) {
        alert('A client with this email already exists.');
        return;
      }

      const trialDays = 14;
      const trialStart = new Date();
      trialStart.setHours(0, 0, 0, 0);
      const trialEnd = new Date(trialStart);
      trialEnd.setDate(trialEnd.getDate() + trialDays);

      await addDoc(collection(db, 'platformClients'), {
        name: companyName,
        contactPerson: personName,
        mobileNumber: contactNumber,
        email,
        address: addClientForm.address.trim(),
        gstn: addClientForm.gstn.trim(),
        logoUrl: addClientForm.companyLogoUrl.trim(),
        state: 'trial',
        trialDays,
        subscriptionStartDate: trialStart.toISOString().slice(0, 10),
        subscriptionExpiryDate: trialEnd.toISOString().slice(0, 10),
        paymentStatus: 'pending',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setModule('status');
      setAddClientForm({
        companyLogoUrl: '',
        companyName: '',
        personName: '',
        contactNumber: '',
        email: '',
        address: '',
        gstn: '',
      });
      alert('Client created successfully and started in Trial phase.');
    } catch (error) {
      console.error('Failed to save client', error);
      alert('Could not save client. Please try again.');
    } finally {
      setSavingClient(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
      <aside className="bg-white border border-gray-200 rounded-2xl p-3 h-fit">
        <h2 className="px-2 pb-3 text-sm font-black text-gray-800 uppercase tracking-wider">Super Admin</h2>
        <div className="space-y-1">
          {MODULES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setModule(item.id)}
                className={`w-full px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
                  module === item.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" /> {item.label}
              </button>
            );
          })}
        </div>
      </aside>

      <section className="bg-white border border-gray-200 rounded-2xl p-6">
        {module === 'dashboard' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Dashboard</h3>
            <p className="text-sm text-gray-500 mt-2">Ready for your requirements.</p>
          </div>
        )}

        {module === 'add_client' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Add Client</h3>
            <p className="text-sm text-gray-500 mt-2">Fill details and Save to start Trial automatically.</p>
            <form onSubmit={handleSaveClient} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={addClientForm.companyLogoUrl}
                onChange={(e) => setAddClientForm((prev) => ({ ...prev, companyLogoUrl: e.target.value }))}
                placeholder="Upload Company Logo (URL)"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm md:col-span-2"
              />
              <input
                required
                value={addClientForm.companyName}
                onChange={(e) => setAddClientForm((prev) => ({ ...prev, companyName: e.target.value }))}
                placeholder="Company Name"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                required
                value={addClientForm.personName}
                onChange={(e) => setAddClientForm((prev) => ({ ...prev, personName: e.target.value }))}
                placeholder="Person Name"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                required
                value={addClientForm.contactNumber}
                onChange={(e) => setAddClientForm((prev) => ({ ...prev, contactNumber: e.target.value }))}
                placeholder="Contact Number"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                required
                type="email"
                value={addClientForm.email}
                onChange={(e) => setAddClientForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <input
                value={addClientForm.address}
                onChange={(e) => setAddClientForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Address"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm md:col-span-2"
              />
              <input
                value={addClientForm.gstn}
                onChange={(e) => setAddClientForm((prev) => ({ ...prev, gstn: e.target.value }))}
                placeholder="GSTN"
                className="px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={savingClient}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-60"
                >
                  {savingClient ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        )}

        {module === 'status' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Status</h3>
            <p className="text-sm text-gray-500 mt-2">Search + click company name to edit. Use Add Payments to redirect.</p>
            <div className="mt-4">
              <input
                value={statusSearch}
                onChange={(e) => setStatusSearch(e.target.value)}
                placeholder="Search company / person / contact / status"
                className="w-full md:w-[420px] px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    {[
                      ['name', 'Company Name'],
                      ['person', 'Person Name'],
                      ['contact', 'Contact No.'],
                      ['users', 'No. of Active users'],
                      ['payment', 'Last Payment period'],
                      ['status', 'Status'],
                      ['expiry', 'Expiry Date'],
                      ['days', 'No. of days left'],
                    ].map(([key, label]) => (
                      <th key={key} className="px-3 py-2">
                        <button type="button" onClick={() => setStatusSort((p) => ({ key, dir: p.key === key && p.dir === 'asc' ? 'desc' : 'asc' }))}>
                          {label}
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2">Add payments</th>
                  </tr>
                </thead>
                <tbody>
                  {statusRows.map((client) => {
                    const activeUsers = users.filter((u) => (u as any).clientId === client.id && u.role !== 'suspended' && u.role !== 'deleted').length;
                    const expiryText = client.subscriptionExpiryDate || '-';
                    const daysLeft = client.subscriptionExpiryDate ? Math.ceil((new Date(client.subscriptionExpiryDate).getTime() - Date.now()) / 86400000) : '-';
                    return (
                      <tr key={client.id} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-semibold">
                          <button className="text-blue-700 hover:underline" onClick={() => openEditClient(client)}>{client.name}</button>
                        </td>
                        <td className="px-3 py-2">{client.contactPerson || '-'}</td>
                        <td className="px-3 py-2">{client.mobileNumber || '-'}</td>
                        <td className="px-3 py-2">{activeUsers}</td>
                        <td className="px-3 py-2 capitalize">{client.billingCycle || '-'}</td>
                        <td className="px-3 py-2 capitalize">{client.state || 'trial'}</td>
                        <td className="px-3 py-2">{expiryText}</td>
                        <td className="px-3 py-2">{daysLeft}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => { setSelectedPaymentClientId(client.id); setModule('payments'); }}
                            className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold"
                          >
                            Add Payments
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {statusRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">No companies found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {editingClientId && (
              <form onSubmit={saveEditedClient} className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3 border border-gray-200 rounded-xl p-4">
                <input required value={editingClientForm.name} onChange={(e) => setEditingClientForm((p) => ({ ...p, name: e.target.value }))} placeholder="Company Name" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                <input value={editingClientForm.contactPerson} onChange={(e) => setEditingClientForm((p) => ({ ...p, contactPerson: e.target.value }))} placeholder="Person Name" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                <input value={editingClientForm.mobileNumber} onChange={(e) => setEditingClientForm((p) => ({ ...p, mobileNumber: e.target.value }))} placeholder="Contact Number" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                <input type="email" value={editingClientForm.email} onChange={(e) => setEditingClientForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                <input value={editingClientForm.address} onChange={(e) => setEditingClientForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" className="px-3 py-2 border border-gray-200 rounded-xl text-sm md:col-span-2" />
                <input value={editingClientForm.gstn} onChange={(e) => setEditingClientForm((p) => ({ ...p, gstn: e.target.value }))} placeholder="GSTN" className="px-3 py-2 border border-gray-200 rounded-xl text-sm" />
                <div className="md:col-span-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingClientId(null)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold">Save Changes</button>
                </div>
              </form>
            )}
          </div>
        )}

        {module === 'payments' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Payments</h3>
            <p className="text-sm text-gray-500 mt-2">Selected Company: {selectedPaymentClientId || 'None'}</p>
          </div>
        )}

        {module === 'transactions' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Transactions</h3>
            <p className="text-sm text-gray-500 mt-2">Ready for your requirements.</p>
          </div>
        )}

        {module === 'followups' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Followups</h3>
            <p className="text-sm text-gray-500 mt-2">Ready for your requirements.</p>
          </div>
        )}

        {module === 'tickets' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Tickets</h3>
            <p className="text-sm text-gray-500 mt-2">Ready for your requirements.</p>
          </div>
        )}

        {module === 'backup_restore' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Backup & Restore (Full Data)</h3>
            <p className="text-sm text-gray-500 mt-2">Ready for your requirements.</p>
          </div>
        )}
      </section>
    </div>
  );
}
