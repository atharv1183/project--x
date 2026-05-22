import { AuditLogEntry } from '../types';

type ActivityLogsTableProps = {
  logs: AuditLogEntry[];
  emptyMessage?: string;
  showActor?: boolean;
  className?: string;
  formatWhen: (value: any) => string;
};

export default function ActivityLogsTable({
  logs,
  emptyMessage = 'No activity logs found.',
  showActor = true,
  className = '',
  formatWhen,
}: ActivityLogsTableProps) {
  return (
    <div className={`bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden ${className}`.trim()}>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500">When</th>
              {showActor && <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Actor</th>}
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Action</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Target</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Description</th>
              <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Before -&gt; After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-4 py-3 text-xs font-semibold text-gray-700">{formatWhen(log.createdAt)}</td>
                {showActor && (
                  <td className="px-4 py-3 text-xs font-semibold text-gray-700">
                    {log.actorName} ({log.actorRole || 'user'})
                  </td>
                )}
                <td className="px-4 py-3 text-xs font-bold text-gray-700 uppercase">{log.action.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3 text-xs font-semibold text-gray-700">{log.targetType || '-'} {log.targetId ? `#${log.targetId}` : ''}</td>
                <td className="px-4 py-3 text-xs text-gray-700">{log.description || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-700">
                  <div className="max-w-[520px] whitespace-pre-wrap break-words">
                    {log.oldValue || log.newValue
                      ? `${JSON.stringify(log.oldValue ?? {})} -> ${JSON.stringify(log.newValue ?? {})}`
                      : '-'}
                  </div>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={showActor ? 6 : 5} className="px-4 py-10 text-center text-sm text-gray-500">{emptyMessage}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

