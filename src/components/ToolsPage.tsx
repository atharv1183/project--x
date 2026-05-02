import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, Database, Download, FileText, LayoutGrid, Trash2, TrendingUp, Upload, UserPlus, Users, Wrench } from 'lucide-react';
import { collection, doc, getDocs, limit, orderBy, query, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError } from '../lib/utils';
import { OperationType, User } from '../types';

export type ToolTarget =
  | 'leads'
  | 'employees'
  | 'attendance'
  | 'requirements'
  | 'inventory'
  | 'pending'
  | 'today'
  | 'upcoming';

type ToolCard = {
  id: ToolTarget;
  title: string;
  description: string;
  icon: typeof Users;
};

const adminTools: ToolCard[] = [
  { id: 'leads', title: 'Leads', description: 'Manage and update all leads.', icon: Users },
  { id: 'attendance', title: 'Attendance', description: 'Check team clock-in and clock-out logs.', icon: Clock },
  { id: 'inventory', title: 'Inventory', description: 'View and manage property inventory.', icon: LayoutGrid },
  { id: 'requirements', title: 'Requirements', description: 'Track customer needs and requests.', icon: FileText },
  { id: 'employees', title: 'Team', description: 'Manage employee accounts and status.', icon: UserPlus },
];

const employeeTools: ToolCard[] = [
  { id: 'today', title: 'Leads', description: 'Open today follow-up queue.', icon: Users },
  { id: 'attendance', title: 'Attendance', description: 'Use clock-in and clock-out with GPS.', icon: Clock },
  { id: 'inventory', title: 'Inventory', description: 'Browse approved inventory records.', icon: LayoutGrid },
  { id: 'requirements', title: 'Requirements', description: 'Add and review customer requirements.', icon: FileText },
  { id: 'upcoming', title: 'Upcoming', description: 'Open upcoming follow-up queue.', icon: TrendingUp },
  { id: 'pending', title: 'Pending', description: 'Open pending follow-up queue.', icon: Calendar },
];

type ToolsPageProps = {
  user: User;
  onSelectTool: (tool: ToolTarget) => void;
};

export default function ToolsPage({ user, onSelectTool }: ToolsPageProps) {
  const isAdminLike = user.role === 'admin' || user.role === 'manager';
  const cards = isAdminLike ? adminTools : employeeTools;
  const leadsImportInputRef = useRef<HTMLInputElement | null>(null);
  const inventoryImportInputRef = useRef<HTMLInputElement | null>(null);
  const [dataToolsBusy, setDataToolsBusy] = useState<string | null>(null);

  const serializeFirestoreValue = (value: any): any => {
    if (value instanceof Timestamp) {
      return { __ts: value.toMillis() };
    }
    if (value && typeof value === 'object' && typeof value.toDate === 'function') {
      const parsed = value.toDate();
      if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
        return { __ts: parsed.getTime() };
      }
    }
    if (Array.isArray(value)) {
      return value.map((entry) => serializeFirestoreValue(entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, serializeFirestoreValue(v)])
      );
    }
    return value;
  };

  const deserializeFirestoreValue = (value: any): any => {
    if (Array.isArray(value)) {
      return value.map((entry) => deserializeFirestoreValue(entry));
    }
    if (value && typeof value === 'object') {
      if (typeof value.__ts === 'number') {
        return Timestamp.fromMillis(value.__ts);
      }
      if (typeof value.seconds === 'number' && typeof value.nanoseconds === 'number' && Object.keys(value).length <= 3) {
        return Timestamp.fromMillis(value.seconds * 1000 + Math.floor(value.nanoseconds / 1000000));
      }
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, deserializeFirestoreValue(v)])
      );
    }
    return value;
  };

  const downloadJsonFile = (filename: string, payload: any) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportLeadsData = async () => {
    setDataToolsBusy('export_leads');
    try {
      const leadsSnapshot = await getDocs(collection(db, 'leads'));
      const records = [];
      for (const leadDoc of leadsSnapshot.docs) {
        const followupsSnapshot = await getDocs(query(collection(db, 'leads', leadDoc.id, 'followups'), orderBy('date', 'asc')));
        records.push({
          id: leadDoc.id,
          data: serializeFirestoreValue(leadDoc.data()),
          followups: followupsSnapshot.docs.map((f) => ({
            id: f.id,
            data: serializeFirestoreValue(f.data()),
          })),
        });
      }

      downloadJsonFile(
        `leads-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        { collection: 'leads', exportedAt: new Date().toISOString(), records }
      );
      alert(`Exported ${records.length} leads successfully.`);
    } catch (error) {
      alert(handleFirestoreError(error, OperationType.GET, 'leads'));
    } finally {
      setDataToolsBusy(null);
    }
  };

  const exportInventoryData = async () => {
    setDataToolsBusy('export_inventory');
    try {
      const snapshot = await getDocs(collection(db, 'inventory'));
      const records = snapshot.docs.map((d) => ({
        id: d.id,
        data: serializeFirestoreValue(d.data()),
      }));
      downloadJsonFile(
        `inventory-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        { collection: 'inventory', exportedAt: new Date().toISOString(), records }
      );
      alert(`Exported ${records.length} inventory items successfully.`);
    } catch (error) {
      alert(handleFirestoreError(error, OperationType.GET, 'inventory'));
    } finally {
      setDataToolsBusy(null);
    }
  };

  const commitBatchedWrites = async (
    targetCollection: 'leads' | 'inventory',
    records: Array<{ id?: string; data: any; followups?: Array<{ id?: string; data: any }> }>
  ) => {
    let batch = writeBatch(db);
    let operations = 0;
    let importedRows = 0;

    const flush = async () => {
      if (operations === 0) return;
      await batch.commit();
      batch = writeBatch(db);
      operations = 0;
    };

    for (const record of records) {
      const data = deserializeFirestoreValue(record.data || {});
      const docId = record.id || doc(collection(db, targetCollection)).id;
      batch.set(doc(db, targetCollection, docId), data);
      operations += 1;
      importedRows += 1;

      if (targetCollection === 'leads' && Array.isArray(record.followups)) {
        for (const followup of record.followups) {
          const followupId = followup.id || doc(collection(db, 'leads', docId, 'followups')).id;
          batch.set(doc(db, 'leads', docId, 'followups', followupId), deserializeFirestoreValue(followup.data || {}));
          operations += 1;
          if (operations >= 450) {
            await flush();
          }
        }
      }

      if (operations >= 450) {
        await flush();
      }
    }

    await flush();
    return importedRows;
  };

  const importDataFile = async (targetCollection: 'leads' | 'inventory', file: File) => {
    setDataToolsBusy(`import_${targetCollection}`);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const records = Array.isArray(parsed) ? parsed : parsed?.records;

      if (!Array.isArray(records) || records.length === 0) {
        alert('Selected file has no records to import.');
        return;
      }

      const importedCount = await commitBatchedWrites(targetCollection, records);
      alert(`Imported ${importedCount} ${targetCollection} records successfully.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Import failed. Please verify the JSON file format.');
    } finally {
      setDataToolsBusy(null);
    }
  };

  const deleteAllFollowupsForLead = async (leadId: string) => {
    while (true) {
      const snapshot = await getDocs(query(collection(db, 'leads', leadId, 'followups'), limit(300)));
      if (snapshot.empty) break;

      const batch = writeBatch(db);
      snapshot.docs.forEach((docItem) => batch.delete(docItem.ref));
      await batch.commit();
    }
  };

  const clearEntireInventory = async () => {
    if (!confirm('This will permanently delete ALL inventory records. Continue?')) return;
    if (!confirm('Please confirm again: delete entire inventory database now?')) return;

    setDataToolsBusy('clear_inventory');
    try {
      let deletedCount = 0;
      while (true) {
        const snapshot = await getDocs(query(collection(db, 'inventory'), limit(300)));
        if (snapshot.empty) break;
        const batch = writeBatch(db);
        snapshot.docs.forEach((docItem) => {
          batch.delete(docItem.ref);
          deletedCount += 1;
        });
        await batch.commit();
      }
      alert(`Cleared inventory database. Deleted ${deletedCount} documents.`);
    } catch (error) {
      alert(handleFirestoreError(error, OperationType.DELETE, 'inventory'));
    } finally {
      setDataToolsBusy(null);
    }
  };

  const clearEntireLeads = async () => {
    if (!confirm('This will permanently delete ALL leads and follow-up history. Continue?')) return;
    if (!confirm('Please confirm again: delete entire leads database now?')) return;

    setDataToolsBusy('clear_leads');
    try {
      let deletedLeads = 0;
      while (true) {
        const leadsSnapshot = await getDocs(query(collection(db, 'leads'), limit(120)));
        if (leadsSnapshot.empty) break;

        for (const leadDoc of leadsSnapshot.docs) {
          await deleteAllFollowupsForLead(leadDoc.id);
        }

        const batch = writeBatch(db);
        leadsSnapshot.docs.forEach((leadDoc) => {
          batch.delete(leadDoc.ref);
          deletedLeads += 1;
        });
        await batch.commit();
      }

      alert(`Cleared leads database. Deleted ${deletedLeads} leads (with their follow-ups).`);
    } catch (error) {
      alert(handleFirestoreError(error, OperationType.DELETE, 'leads'));
    } finally {
      setDataToolsBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
            <Wrench size={20} />
          </div>
          <h2 className="text-2xl font-black text-slate-900">Tools</h2>
        </div>
        <p className="text-sm text-slate-500 font-medium">Open any module from this page.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card, idx) => (
          <motion.button
            key={card.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: idx * 0.03 }}
            onClick={() => onSelectTool(card.id)}
            className="text-left bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:border-blue-200 hover:shadow-md transition-all active:scale-[0.99]"
          >
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <card.icon size={20} />
            </div>
            <h3 className="text-lg font-black text-slate-900">{card.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{card.description}</p>
          </motion.button>
        ))}
      </div>

      {isAdminLike && (
        <div className="bg-white border border-gray-100 rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Database size={18} className="text-blue-600" />
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">Admin Data Tools</h3>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Leads Database</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(dataToolsBusy)}
                  onClick={exportLeadsData}
                  className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-black uppercase tracking-wider hover:bg-blue-100 transition-colors disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5"><Download size={14} /> Export</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(dataToolsBusy)}
                  onClick={() => leadsImportInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black uppercase tracking-wider hover:bg-emerald-100 transition-colors disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Import</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(dataToolsBusy)}
                  onClick={clearEntireLeads}
                  className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-black uppercase tracking-wider hover:bg-rose-100 transition-colors disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5"><Trash2 size={14} /> Clear All</span>
                </button>
              </div>
              <input
                ref={leadsImportInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await importDataFile('leads', file);
                  e.currentTarget.value = '';
                }}
              />
            </div>

            <div className="rounded-xl border border-gray-100 p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Inventory Database</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={Boolean(dataToolsBusy)}
                  onClick={exportInventoryData}
                  className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-black uppercase tracking-wider hover:bg-blue-100 transition-colors disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5"><Download size={14} /> Export</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(dataToolsBusy)}
                  onClick={() => inventoryImportInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black uppercase tracking-wider hover:bg-emerald-100 transition-colors disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5"><Upload size={14} /> Import</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(dataToolsBusy)}
                  onClick={clearEntireInventory}
                  className="px-3 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-black uppercase tracking-wider hover:bg-rose-100 transition-colors disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-1.5"><Trash2 size={14} /> Clear All</span>
                </button>
              </div>
              <input
                ref={inventoryImportInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await importDataFile('inventory', file);
                  e.currentTarget.value = '';
                }}
              />
            </div>
          </div>
          {dataToolsBusy && (
            <p className="mt-3 text-[11px] font-bold text-blue-600 uppercase tracking-widest">
              Processing: {dataToolsBusy.replace('_', ' ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
