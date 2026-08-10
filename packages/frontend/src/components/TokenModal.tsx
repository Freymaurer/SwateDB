import { AlertBanner } from './AlertBanner';

interface TokenModalProps {
  tokenDraft: string;
  onTokenDraftChange: (value: string) => void;
  onSave: () => void;
  errorMessage: string | null;
}

export function TokenModal({ tokenDraft, onTokenDraftChange, onSave, errorMessage }: TokenModalProps): JSX.Element {
  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h2 className="text-xl font-bold">Admin Token Required</h2>
        <p className="py-4 text-base-content/70">
          Enter your backend ADMIN_TOKEN to authenticate all admin API calls. The token is stored in
          sessionStorage for the current browser session only.
        </p>

        <AlertBanner type="error" message={errorMessage} />

        <label className="form-control w-full">
          <div className="label">
            <span className="label-text">Bearer Token</span>
          </div>
          <input
            type="password"
            className="input input-bordered w-full"
            value={tokenDraft}
            onChange={(e) => onTokenDraftChange(e.target.value)}
            placeholder="paste ADMIN_TOKEN"
          />
        </label>

        <div className="modal-action">
          <button className="btn btn-primary" type="button" onClick={onSave}>
            Save Token
          </button>
        </div>
      </div>
    </div>
  );
}
