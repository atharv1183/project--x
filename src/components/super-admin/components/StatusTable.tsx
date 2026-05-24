import { User } from '../../../types';
import { PlatformClient, StatusSort } from '../types';

type StatusTableProps = {
  rows: PlatformClient[];
  users: User[];
  statusSort: StatusSort;
  onSort: (key: string) => void;
  onEdit: (client: PlatformClient) => void;
  onAddPayments: (clientId: string) => void;
};

export function StatusTable({ rows, users, statusSort, onSort, onEdit, onAddPayments }: StatusTableProps) {
  return (
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
                <button type="button" onClick={() => onSort(key)}>
                  {label}
                  {statusSort.key === key ? (statusSort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
            <th className="px-3 py-2">Add payments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((client) => {
            const activeUsers = users.filter((u) => (u as any).clientId === client.id && u.role !== 'suspended' && u.role !== 'deleted').length;
            const expiryText = client.subscriptionExpiryDate || '-';
            const daysLeft = client.subscriptionExpiryDate ? Math.ceil((new Date(client.subscriptionExpiryDate).getTime() - Date.now()) / 86400000) : '-';
            return (
              <tr key={client.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-semibold">
                  <button className="text-blue-700 hover:underline" onClick={() => onEdit(client)}>{client.name}</button>
                </td>
                <td className="px-3 py-2">{client.contactPerson || '-'}</td>
                <td className="px-3 py-2">{client.mobileNumber || '-'}</td>
                <td className="px-3 py-2">{activeUsers}</td>
                <td className="px-3 py-2 capitalize">{client.billingCycle || '-'}</td>
                <td className="px-3 py-2 capitalize">{client.state || 'trial'}</td>
                <td className="px-3 py-2">{expiryText}</td>
                <td className="px-3 py-2">{daysLeft}</td>
                <td className="px-3 py-2">
                  <button onClick={() => onAddPayments(client.id)} className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold">Add Payments</button>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-sm text-gray-500">No companies found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
