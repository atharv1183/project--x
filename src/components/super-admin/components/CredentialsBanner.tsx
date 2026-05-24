import { NewClientCredentials } from '../types';

type CredentialsBannerProps = {
  credentials: NewClientCredentials;
  onClose: () => void;
};

export function CredentialsBanner({ credentials, onClose }: CredentialsBannerProps) {
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-black text-emerald-800">Client Admin Credentials Created</p>
      <p className="mt-1 text-sm text-emerald-700">Company: {credentials.companyName}</p>
      <p className="text-sm text-emerald-700">Email: {credentials.email}</p>
      <p className="text-sm text-emerald-700">Temporary Password: {credentials.tempPassword}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(
              `Company: ${credentials.companyName}\nEmail: ${credentials.email}\nTemporary Password: ${credentials.tempPassword}`
            );
            alert('Credentials copied.');
          }}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold"
        >
          Copy Credentials
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 text-xs font-bold"
        >
          Close
        </button>
      </div>
    </div>
  );
}

