import type { FormEvent } from 'react';
import { useState } from 'react';
import { searchTerms, type TermSearchEntry } from '../api';
import { toErrorMessage } from '../lib/errors';

export function TermSearchView(): JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TermSearchEntry[]>([]);
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalized = query.trim();
    if (normalized.length === 0) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const payload = await searchTerms(normalized);
      setResults(payload.member);
      setTotalItems(payload.totalItems);
      setSearched(true);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form className="flex gap-2" onSubmit={(event) => void onSubmit(event)}>
        <input
          type="text"
          className="input flex-1"
          placeholder="Search terms by name or definition..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="btn" type="submit" disabled={busy || query.trim().length === 0}>
          {busy ? 'Searching...' : 'Search'}
        </button>
      </form>

      {errorMessage !== null ? (
        <div className="text-error text-sm">{errorMessage}</div>
      ) : null}

      {searched && errorMessage === null ? (
        <section className="space-y-4">
          <p className="text-sm text-base-content/60">
            {totalItems ?? 0} term{totalItems === 1 ? '' : 's'} found
          </p>
          {results.length === 0 ? (
            <p className="text-base-content/50">No terms match your search.</p>
          ) : (
            <ul className="menu bg-base-200 rounded-box w-full">
              {results.map((entry) => (
                <li key={entry['@id']}>
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm">{entry['dcterms:title']}</strong>
                      <span className="badge badge-sm badge-outline">{entry['dcterms:identifier']}</span>
                    </div>
                    <small className="text-base-content/50">
                      {entry['dcterms:description'] ?? 'No definition'} · {entry['mod:artefact']}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
