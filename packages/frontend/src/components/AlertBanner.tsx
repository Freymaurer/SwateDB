interface AlertBannerProps {
  type: 'error' | 'success';
  message: string | null;
  onDismiss?: () => void;
}

export function AlertBanner({ type, message, onDismiss }: AlertBannerProps): JSX.Element | null {
  if (message === null) {
    return null;
  }

  const className = type === 'error' ? 'alert alert-error' : 'alert alert-success';

  return (
    <div className={className} role="alert">
      <span>{message}</span>
      {onDismiss ? (
        <button
          className="btn btn-ghost btn-xs ml-2"
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
