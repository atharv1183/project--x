import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { User } from '../types';
import { db } from '../lib/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { AddClientForm } from './super-admin/components/AddClientForm';
import { CredentialsBanner } from './super-admin/components/CredentialsBanner';
import { EditClientPanel } from './super-admin/components/EditClientPanel';
import { Sidebar } from './super-admin/components/Sidebar';
import { StatusTable } from './super-admin/components/StatusTable';
import {
  AddClientFormState,
  EditClientFormState,
  NewClientCredentials,
  PlatformClient,
  StatusSort,
  SuperAdminModule,
} from './super-admin/types';

type Props = {
  user: User;
  onStartImpersonation: (payload: { clientId: string; clientName: string }) => Promise<void>;
};

const INITIAL_EDIT_FORM: EditClientFormState = {
  name: '',
  contactPerson: '',
  mobileNumber: '',
  email: '',
  address: '',
  gstn: '',
  state: 'trial',
  trialDays: '14',
  subscriptionExpiryDate: '',
  adminTempPassword: '',
};

const INITIAL_ADD_FORM: AddClientFormState = {
  companyLogoUrl: '',
  companyName: '',
  personName: '',
  contactNumber: '',
  email: '',
  address: '',
  gstn: '',
};

export default function SuperAdminControlCenter({ user }: Props) {
  const [module, setModule] = useState<SuperAdminModule>('dashboard');
  const [clients, setClients] = useState<PlatformClient[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusSearch, setStatusSearch] = useState('');
  const [statusSort, setStatusSort] = useState<StatusSort>({ key: 'name', dir: 'asc' });
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingClientForm, setEditingClientForm] = useState<EditClientFormState>(INITIAL_EDIT_FORM);
  const [selectedPaymentClientId, setSelectedPaymentClientId] = useState<string>('');
  const [newClientCredentials, setNewClientCredentials] = useState<NewClientCredentials | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [addClientForm, setAddClientForm] = useState<AddClientFormState>(INITIAL_ADD_FORM);

  useEffect(() => {
    const unsubClients = onSnapshot(query(collection(db, 'platformClients'), orderBy('name', 'asc')), (snapshot) => {
      setClients(snapshot.docs.map((snapshotDoc) => ({ id: snapshotDoc.id, ...snapshotDoc.data() } as PlatformClient)));
    });
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      setUsers(snapshot.docs.map((snapshotDoc) => ({ uid: snapshotDoc.id, ...snapshotDoc.data() } as User)));
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

    const compare = (a: unknown, b: unknown) =>
      String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });

    const rows = [...filtered];
    rows.sort((a, b) => {
      const aUsers = users.filter((u) => (u as any).clientId === a.id && u.role !== 'suspended' && u.role !== 'deleted').length;
      const bUsers = users.filter((u) => (u as any).clientId === b.id && u.role !== 'suspended' && u.role !== 'deleted').length;
      const aDays = a.subscriptionExpiryDate
        ? Math.ceil((new Date(a.subscriptionExpiryDate).getTime() - Date.now()) / 86400000)
        : Number.MAX_SAFE_INTEGER;
      const bDays = b.subscriptionExpiryDate
        ? Math.ceil((new Date(b.subscriptionExpiryDate).getTime() - Date.now()) / 86400000)
        : Number.MAX_SAFE_INTEGER;

      const mapA: Record<string, unknown> = {
        name: a.name,
        person: a.contactPerson,
        contact: a.mobileNumber,
        users: aUsers,
        payment: a.billingCycle || '-',
        status: a.state || 'trial',
        expiry: a.subscriptionExpiryDate || '',
        days: aDays,
      };
      const mapB: Record<string, unknown> = {
        name: b.name,
        person: b.contactPerson,
        contact: b.mobileNumber,
        users: bUsers,
        payment: b.billingCycle || '-',
        status: b.state || 'trial',
        expiry: b.subscriptionExpiryDate || '',
        days: bDays,
      };

      const left = mapA[statusSort.key];
      const right = mapB[statusSort.key];
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : compare(left, right);
      return statusSort.dir === 'asc' ? result : -result;
    });
    return rows;
  }, [clients, statusSearch, statusSort, users]);

  const openEditClient = (client: PlatformClient) => {
    setEditingClientId(client.id);
    setEditingClientForm({
      name: client.name || '',
      contactPerson: client.contactPerson || '',
      mobileNumber: client.mobileNumber || '',
      email: client.email || '',
      address: client.address || '',
      gstn: client.gstn || '',
      state: client.state || 'trial',
      trialDays: String(client.trialDays || 14),
      subscriptionExpiryDate: client.subscriptionExpiryDate || '',
      adminTempPassword: client.adminTempPassword || '',
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
      state: editingClientForm.state,
      trialDays: Number(editingClientForm.trialDays || '14'),
      subscriptionExpiryDate: editingClientForm.subscriptionExpiryDate || null,
      updatedAt: serverTimestamp(),
    });

    setEditingClientId(null);
    setEditingClientForm(INITIAL_EDIT_FORM);
  };

  const handleDeleteCompany = async () => {
    if (!editingClientId) return;
    const target = clients.find((item) => item.id === editingClientId);
    if (!target) return;
    if (!window.confirm(`Delete company "${target.name}"? This will remove company profile and mark its users as deleted.`)) {
      return;
    }

    const relatedUsers = users.filter((member) => (member as any).clientId === editingClientId);
    const batch = writeBatch(db);
    relatedUsers.forEach((member) => {
      batch.update(doc(db, 'users', member.uid), {
        role: 'deleted',
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    await deleteDoc(doc(db, 'platformClients', editingClientId));
    setEditingClientId(null);
    setEditingClientForm(INITIAL_EDIT_FORM);
    alert('Company deleted and related users marked as deleted.');
  };

  const handleSaveClient = async (e: FormEvent) => {
    e.preventDefault();
    const companyName = addClientForm.companyName.trim();
    const personName = addClientForm.personName.trim();
    const contactNumber = addClientForm.contactNumber.replace(/\D/g, '');
    const email = addClientForm.email.trim().toLowerCase();
    const loginEmail = `${contactNumber}@estatepulse.com`;

    if (!companyName) return alert('Company Name is required.');
    if (!personName) return alert('Person Name is required.');
    if (contactNumber.length < 10 || contactNumber.length > 15) return alert('Contact number must be 10 to 15 digits.');
    if (!email) return alert('Email is required.');

    setSavingClient(true);
    let provisionApp: ReturnType<typeof initializeApp> | null = null;
    let provisionAuth: ReturnType<typeof getAuth> | null = null;
    let provisionedUid: string | null = null;

    try {
      const existingCompanyByEmail = await getDocs(query(collection(db, 'platformClients'), where('email', '==', email)));
      if (!existingCompanyByEmail.empty) {
        alert('A client with this email already exists.');
        return;
      }

      const existingUserByEmail = await getDocs(query(collection(db, 'users'), where('email', '==', loginEmail)));
      if (!existingUserByEmail.empty) {
        alert('A user with this contact number already exists.');
        return;
      }

      const trialDays = 14;
      const trialStart = new Date();
      trialStart.setHours(0, 0, 0, 0);
      const trialEnd = new Date(trialStart);
      trialEnd.setDate(trialEnd.getDate() + trialDays);

      const tempPassword = `${contactNumber}${Math.floor(100 + Math.random() * 900)}`;

      provisionApp = initializeApp(firebaseConfig, `client-admin-provisioner-${Date.now()}`);
      provisionAuth = getAuth(provisionApp);
      const userCredential = await createUserWithEmailAndPassword(provisionAuth, loginEmail, tempPassword);
      provisionedUid = userCredential.user.uid;

      const clientRef = await addDoc(collection(db, 'platformClients'), {
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
        adminUid: provisionedUid,
        adminEmail: loginEmail,
        adminTempPassword: tempPassword,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'users', provisionedUid), {
        uid: provisionedUid,
        name: `${companyName} Admin`,
        email: loginEmail,
        phone: contactNumber,
        role: 'client_admin',
        clientId: clientRef.id,
        clientName: companyName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setModule('status');
      setAddClientForm(INITIAL_ADD_FORM);
      setNewClientCredentials({
        companyName,
        email: loginEmail,
        tempPassword,
      });
      alert('Client created successfully and started in Trial phase.');
    } catch (error) {
      if (provisionedUid && provisionAuth?.currentUser) {
        await provisionAuth.currentUser.delete().catch(() => {});
      }
      console.error('Failed to save client', error);
      alert('Could not save client. Please try again.');
    } finally {
      try {
        if (provisionAuth) await signOut(provisionAuth);
      } catch {
        // noop
      }
      if (provisionApp) {
        await deleteApp(provisionApp).catch(() => {});
      }
      setSavingClient(false);
    }
  };

  const handleStatusSort = (key: string) => {
    setStatusSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-5">
      <Sidebar module={module} onSelect={setModule} />

      <section className="bg-white border border-gray-200 rounded-2xl p-6">
        {newClientCredentials && <CredentialsBanner credentials={newClientCredentials} onClose={() => setNewClientCredentials(null)} />}

        {module === 'dashboard' && (
          <div>
            <h3 className="text-xl font-black text-gray-900">Dashboard</h3>
            <p className="text-sm text-gray-500 mt-2">Ready for your requirements.</p>
          </div>
        )}

        {module === 'add_client' && (
          <AddClientForm
            form={addClientForm}
            saving={savingClient}
            onChange={(patch) => setAddClientForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={handleSaveClient}
          />
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

            <StatusTable
              rows={statusRows}
              users={users}
              statusSort={statusSort}
              onSort={handleStatusSort}
              onEdit={openEditClient}
              onAddPayments={(clientId) => {
                setSelectedPaymentClientId(clientId);
                setModule('payments');
              }}
            />

            {editingClientId && (
              <EditClientPanel
                form={editingClientForm}
                onChange={(patch) => setEditingClientForm((prev) => ({ ...prev, ...patch }))}
                onSave={saveEditedClient}
                onCancel={() => {
                  setEditingClientId(null);
                  setEditingClientForm(INITIAL_EDIT_FORM);
                }}
                onDelete={handleDeleteCompany}
              />
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
