interface AlertBannerProps {
  type: 'error' | 'success';
  message: string | null;
}

export function AlertBanner({ type, message }: AlertBannerProps): JSX.Element | null {
  if (message === null) {
    return null;
  }

  const className = type === 'error' ? 'alert alert-error' : 'alert alert-success';

  return (
    <div className={className} role="alert">
      <span>{message}</span>
    </div>
  );
}
