import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { Bell, Database, Gauge, KeyRound, Megaphone, Settings, ShieldCheck, Users } from 'lucide-react';
import { db } from '../lib/firebase';
import { AuditLogEntry, FeatureToggle, PlatformAnnouncement, PlatformClient, User } from '../types';

type Props = {
  user: User;
  onStartImpersonation: (payload: { clientId: string; clientName: string }) => Promise<void>;
};

type Panel = 'security' | 'features' | 'communication' | 'operations';

const PANELS: Array<{ id: Panel; label: string; icon: any }> = [
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'features', label: 'Features', icon: Settings },
  { id: 'communication', label: 'Communication', icon: Megaphone },
  { id: 'operations', label: 'Operations', icon: Gauge },
];

export default function SuperAdminControlCenter({ user, onStartImpersonation }: Props) {
  const [panel, setPanel] = useState<Panel>('security');
  const [clients, setClients] = useState<PlatformClient[]>([]);
  const [featureToggles, setFeatureToggles] = useState<FeatureToggle[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [clientNotes, setClientNotes] = useState<Record<string, string>>({});
  const [globalSettings, setGlobalSettings] = useState({
    companyName: '',
    supportEmail: '',
    logoUrl: '',
    smtpHost: '',
    smtpUser: '',
    smtpFrom: '',
    whatsappApiKey: '',
    razorpayKey: '',
    stripeKey: '',
    fileUploadLimitMb: '20',
    loginRateLimitPerMin: '10',
    apiRateLimitPerMin: '120',
    uploadRateLimitPerHour: '100',
  });
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    message: '',
    severity: 'info' as 'info' | 'warning' | 'critical',
    targetType: 'all' as 'all' | 'selected',
    targetClientIds: [] as string[],
  });
  const [newTemplate, setNewTemplate] = useState({
    key: '',
    subject: '',
    body: 'Hello {{client_name}}',
  });

  useEffect(() => {
    const unsubClients = onSnapshot(
      query(collection(db, 'platformClients'), orderBy('name', 'asc')),
      (sn) => setClients(sn.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformClient)))
    );
    const unsubFeatures = onSnapshot(
      query(collection(db, 'platformFeatureToggles'), orderBy('label', 'asc')),
      (sn) => setFeatureToggles(sn.docs.map((d) => ({ id: d.id, ...d.data() } as FeatureToggle)))
    );
    const unsubAnnouncements = onSnapshot(
      query(collection(db, 'platformAnnouncements'), orderBy('createdAt', 'desc')),
      (sn) => setAnnouncements(sn.docs.map((d) => ({ id: d.id, ...d.data() } as PlatformAnnouncement)))
    );
    const unsubLogs = onSnapshot(
      query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc')),
      (sn) => setAuditLogs(sn.docs.slice(0, 100).map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry)))
    );
    const unsubSettings = onSnapshot(doc(db, 'platformConfig', 'global'), (snap) => {
      if (snap.exists()) setGlobalSettings((prev) => ({ ...prev, ...(snap.data() as any) }));
    });
    return () => {
      unsubClients();
      unsubFeatures();
      unsubAnnouncements();
      unsubLogs();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    if (!clients.length) return;
    const unsubs = clients.map((client) =>
      onSnapshot(doc(db, 'platformClients', client.id, 'internalNotes', 'latest'), (snap) => {
        if (!snap.exists()) return;
        setClientNotes((prev) => ({ ...prev, [client.id]: String((snap.data() as any).note || '') }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [clients]);

  const selectedClientsCount = announcementForm.targetClientIds.length;
  const activeClients = useMemo(() => clients.filter((c) => c.state === 'active').length, [clients]);

  const logAudit = async (action: string, payload: Record<string, any>) => {
    await addDoc(collection(db, 'auditLogs'), {
      action,
      actorId: user.uid,
      actorName: user.name,
      ...payload,
      createdAt: serverTimestamp(),
    });
  };

  const handleImpersonate = async (client: PlatformClient) => {
    await onStartImpersonation({ clientId: client.id, clientName: client.name });
  };

  const toggleFeature = async (feature: FeatureToggle) => {
    await updateDoc(doc(db, 'platformFeatureToggles', feature.id), {
      enabled: !feature.enabled,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    await logAudit('feature_toggle_changed', {
      targetType: 'feature_toggle',
      targetId: feature.id,
      oldValue: { enabled: feature.enabled },
      newValue: { enabled: !feature.enabled },
    });
  };

  const saveGlobalSettings = async (e: FormEvent) => {
    e.preventDefault();
    await setDoc(doc(db, 'platformConfig', 'global'), {
      ...globalSettings,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }, { merge: true });
    await logAudit('global_settings_updated', { targetType: 'platform_config', targetId: 'global' });
    alert('Global settings saved.');
  };

  const createAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.message.trim()) return;
    await addDoc(collection(db, 'platformAnnouncements'), {
      ...announcementForm,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });
    await logAudit('announcement_created', {
      targetType: 'announcement',
      newValue: announcementForm,
    });
    setAnnouncementForm({ title: '', message: '', severity: 'info', targetType: 'all', targetClientIds: [] });
  };

  const updateClientState = async (clientId: string, state: PlatformClient['state']) => {
    const ref = doc(db, 'platformClients', clientId);
    await updateDoc(ref, { state, updatedAt: serverTimestamp() });
    await logAudit('client_state_changed', { targetType: 'client', targetId: clientId, newValue: { state } });
  };

  const bulkSuspendArchived = async (targetState: PlatformClient['state']) => {
    const target = clients.filter((c) => c.state === 'active').slice(0, 100);
    const batch = writeBatch(db);
    target.forEach((c) => batch.update(doc(db, 'platformClients', c.id), { state: targetState, updatedAt: serverTimestamp() }));
    await batch.commit();
    await logAudit('bulk_client_state_change', {
      targetType: 'client',
      newValue: { state: targetState, count: target.length },
    });
    alert(`Updated ${target.length} clients to ${targetState}.`);
  };

  const saveInternalNote = async (clientId: string) => {
    await setDoc(doc(db, 'platformClients', clientId, 'internalNotes', 'latest'), {
      note: clientNotes[clientId] || '',
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }, { merge: true });
    await logAudit('internal_note_updated', { targetType: 'client', targetId: clientId });
  };

  const createTemplate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTemplate.key.trim()) return;
    await setDoc(doc(db, 'platformEmailTemplates', newTemplate.key.trim()), {
      ...newTemplate,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }, { merge: true });
    await logAudit('email_template_upserted', { targetType: 'email_template', targetId: newTemplate.key.trim() });
    setNewTemplate({ key: '', subject: '', body: 'Hello {{client_name}}' });
  };

  const renderSecurity = () => (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><Users className="w-5 h-5" /> Impersonation / Login As Client</h3>
        <div className="grid gap-2">
          {clients.map((client) => (
            <div key={client.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
              <div>
                <p className="font-semibold text-sm text-gray-900">{client.name}</p>
                <p className="text-xs text-gray-500 uppercase">{client.state}</p>
              </div>
              <button onClick={() => handleImpersonate(client)} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">Login As Client Admin</button>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Session Management / Force Logout</h3>
        <button
          onClick={() => addDoc(collection(db, 'sessionRevocations'), { scope: 'all', createdAt: serverTimestamp(), createdBy: user.uid })}
          className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold"
        >
          Force Logout All Sessions
        </button>
      </section>
    </div>
  );

  const renderFeatures = () => (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Global Feature Control</h3>
        <div className="space-y-2">
          {featureToggles.map((feature) => (
            <div key={feature.id} className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2">
              <div>
                <p className="font-semibold text-sm text-gray-900">{feature.label}</p>
                <p className="text-xs text-gray-500">{feature.description || 'Platform feature toggle'}</p>
              </div>
              <button onClick={() => toggleFeature(feature)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${feature.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {feature.enabled ? 'ON' : 'OFF'}
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Global Settings / Rate Limits</h3>
        <form onSubmit={saveGlobalSettings} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(globalSettings).map(([key, value]) => (
            <input key={key} value={value as string} onChange={(e) => setGlobalSettings((prev) => ({ ...prev, [key]: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder={key} />
          ))}
          <button type="submit" className="md:col-span-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">Save Global Settings</button>
        </form>
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Email Template Management</h3>
        <form onSubmit={createTemplate} className="space-y-2">
          <input value={newTemplate.key} onChange={(e) => setNewTemplate((p) => ({ ...p, key: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="template key (welcome_email)" />
          <input value={newTemplate.subject} onChange={(e) => setNewTemplate((p) => ({ ...p, subject: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" placeholder="Subject" />
          <textarea value={newTemplate.body} onChange={(e) => setNewTemplate((p) => ({ ...p, body: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm min-h-[110px]" />
          <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">Save Template</button>
        </form>
      </section>
    </div>
  );

  const renderCommunication = () => (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><Bell className="w-5 h-5" /> Announcement System</h3>
        <form onSubmit={createAnnouncement} className="space-y-2">
          <input value={announcementForm.title} onChange={(e) => setAnnouncementForm((p) => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Title" />
          <textarea value={announcementForm.message} onChange={(e) => setAnnouncementForm((p) => ({ ...p, message: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm min-h-[100px]" placeholder="Message" />
          <div className="grid grid-cols-2 gap-2">
            <select value={announcementForm.severity} onChange={(e) => setAnnouncementForm((p) => ({ ...p, severity: e.target.value as any }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
            <select value={announcementForm.targetType} onChange={(e) => setAnnouncementForm((p) => ({ ...p, targetType: e.target.value as any }))} className="px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="all">All Clients</option>
              <option value="selected">Selected Clients</option>
            </select>
          </div>
          {announcementForm.targetType === 'selected' && (
            <div className="border border-gray-100 rounded-xl p-2 max-h-40 overflow-y-auto">
              {clients.map((client) => {
                const checked = announcementForm.targetClientIds.includes(client.id);
                return (
                  <label key={client.id} className="flex items-center gap-2 text-sm py-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setAnnouncementForm((p) => ({
                          ...p,
                          targetClientIds: e.target.checked ? [...p.targetClientIds, client.id] : p.targetClientIds.filter((id) => id !== client.id),
                        }))
                      }
                    />
                    {client.name}
                  </label>
                );
              })}
            </div>
          )}
          <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">
            Send Announcement {announcementForm.targetType === 'selected' ? `(${selectedClientsCount})` : ''}
          </button>
        </form>
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">Recent Announcements</h3>
        <div className="space-y-2">
          {announcements.slice(0, 10).map((item) => (
            <div key={item.id} className="border border-gray-100 rounded-xl px-3 py-2">
              <p className="font-semibold text-sm text-gray-900">{item.title}</p>
              <p className="text-xs text-gray-600">{item.message}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderOperations = () => (
    <div className="space-y-6">
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2"><Database className="w-5 h-5" /> Client State / Archive / Export</h3>
        <div className="mb-3 flex gap-2">
          <button onClick={() => bulkSuspendArchived('suspended')} className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold">Bulk Suspend Active</button>
          <button onClick={() => bulkSuspendArchived('archived')} className="px-3 py-2 rounded-lg bg-gray-700 text-white text-sm font-semibold">Bulk Archive Active</button>
        </div>
        <div className="space-y-2">
          {clients.map((client) => (
            <div key={client.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-sm text-gray-900">{client.name}</p>
                <div className="flex items-center gap-2">
                  <select value={client.state} onChange={(e) => updateClientState(client.id, e.target.value as any)} className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs">
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="archived">Archived</option>
                    <option value="deleted_permanently">Deleted Permanently</option>
                  </select>
                  <button
                    onClick={() => addDoc(collection(db, 'platformDataExportJobs'), { clientId: client.id, format: 'json', createdAt: serverTimestamp(), createdBy: user.uid })}
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold"
                  >
                    Export
                  </button>
                </div>
              </div>
              <textarea
                value={clientNotes[client.id] || ''}
                onChange={(e) => setClientNotes((prev) => ({ ...prev, [client.id]: e.target.value }))}
                className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-xs min-h-[68px]"
                placeholder="Internal notes"
              />
              <div className="mt-2 flex justify-end">
                <button onClick={() => saveInternalNote(client.id)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold">Save Note</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">API Key / Domain / Reminders / Queue / Version</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button onClick={() => addDoc(collection(db, 'platformApiKeys'), { name: 'generated-key', status: 'active', createdAt: serverTimestamp(), createdBy: user.uid })} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold text-left"><KeyRound className="inline w-4 h-4 mr-2" />Generate API Key</button>
          <button onClick={() => addDoc(collection(db, 'platformVersionHistory'), { version: `v${Date.now()}`, notes: 'Release note placeholder', createdAt: serverTimestamp(), createdBy: user.uid })} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold text-left">Add Version Entry</button>
          <button onClick={() => addDoc(collection(db, 'platformQueueJobs'), { type: 'report_generation', status: 'queued', createdAt: serverTimestamp(), createdBy: user.uid })} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold text-left">Queue Report Job</button>
          <button onClick={() => addDoc(collection(db, 'platformFollowupReminders'), { title: 'Renewal Follow-up', dueAt: serverTimestamp(), createdAt: serverTimestamp(), createdBy: user.uid })} className="px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-semibold text-left">Create Follow-up Reminder</button>
        </div>
      </section>
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-bold text-gray-900 mb-3">System Health / Failed Tasks / Analytics</h3>
        <p className="text-sm text-gray-600 mb-3">Active Clients: {activeClients} / Total Clients: {clients.length}</p>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {auditLogs.slice(0, 20).map((log) => (
            <div key={log.id} className="border border-gray-100 rounded-xl px-3 py-2">
              <p className="text-xs font-semibold text-gray-900">{log.action}</p>
              <p className="text-[11px] text-gray-500">{log.actorName} · {log.targetType || 'system'} · {log.targetId || '--'}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Super Admin Control Center</h2>
        <p className="text-sm text-gray-500">Centralized platform controls for security, releases, compliance, and operations.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PANELS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => setPanel(item.id)} className={`px-3 py-2 rounded-xl text-sm font-semibold border flex items-center gap-2 ${panel === item.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>
      {panel === 'security' ? renderSecurity() : panel === 'features' ? renderFeatures() : panel === 'communication' ? renderCommunication() : renderOperations()}
    </div>
  );
}
