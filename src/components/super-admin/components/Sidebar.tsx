import { MODULES } from '../constants';
import { SuperAdminModule } from '../types';

type SidebarProps = {
  module: SuperAdminModule;
  onSelect: (id: SuperAdminModule) => void;
};

export function Sidebar({ module, onSelect }: SidebarProps) {
  return (
    <aside className="bg-white border border-gray-200 rounded-2xl p-3 h-fit">
      <h2 className="px-2 pb-3 text-sm font-black text-gray-800 uppercase tracking-wider">Super Admin</h2>
      <div className="space-y-1">
        {MODULES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
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
  );
}

