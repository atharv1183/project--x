type NotificationSettings = {
  officeStart: string;
  officeEnd: string;
  reminderIntervalValue: number;
  reminderIntervalUnit: 'minutes' | 'hours';
};

type NotificationSettingsPanelProps = {
  settings: NotificationSettings;
  onChange: (next: NotificationSettings) => void;
  onSave: () => void;
};

export default function NotificationSettingsPanel({ settings, onChange, onSave }: NotificationSettingsPanelProps) {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Office Start Time</label>
          <input
            type="time"
            value={settings.officeStart}
            onChange={(e) => onChange({ ...settings, officeStart: e.target.value })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Office End Time</label>
          <input
            type="time"
            value={settings.officeEnd}
            onChange={(e) => onChange({ ...settings, officeEnd: e.target.value })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Frequency Value</label>
          <input
            type="number"
            min={1}
            value={settings.reminderIntervalValue}
            onChange={(e) => onChange({ ...settings, reminderIntervalValue: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Frequency Unit</label>
          <select
            value={settings.reminderIntervalUnit}
            onChange={(e) => onChange({ ...settings, reminderIntervalUnit: e.target.value as 'minutes' | 'hours' })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl"
          >
            <option value="hours">Hourly</option>
            <option value="minutes">Minutes</option>
          </select>
        </div>
      </div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
        Default: Office hours 9:00 AM to 8:00 PM, reminder every 1 hour. Reminders run only during office hours.
      </div>
      <button
        type="button"
        onClick={onSave}
        className="px-5 py-3 rounded-xl bg-blue-600 text-white font-bold"
      >
        Save Notification Settings
      </button>
    </div>
  );
}

