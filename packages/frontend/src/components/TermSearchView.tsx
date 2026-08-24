import type { FormEvent } from 'react';
import { useState } from 'react';
import { searchTerms, type TermSearchEntry } from '../api';
import { toErrorMessage } from '../lib/errors';

const PAGE_SIZE = 20;

export function TermSearchView(): JSX.Element {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<TermSearchEntry[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const firstItem = totalItems === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, totalItems);

  async function fetchPage(nextPage: number, searchQuery: string): Promise<void> {
    setBusy(true);
    setErrorMessage(null);

    try {
      const payload = await searchTerms(searchQuery, nextPage, PAGE_SIZE);
      setResults(payload.member);
      setTotalItems(payload.totalItems);
      setPage(nextPage);
      setSearched(true);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const normalized = query.trim();
    if (normalized.length === 0) {
      return;
    }

    setSubmittedQuery(normalized);
    await fetchPage(1, normalized);
  }

  return (
    <div className="space-y-6">
      <form className="flex gap-2" onSubmit={(event) => void onSubmit(event)}>
        <input
          type="text"
          className="input flex-1"
          placeholder="Search terms by name..."
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
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-base-content/60">
              {totalItems === 0
                ? 'No terms match your search.'
                : `Showing ${firstItem}–${lastItem} of ${totalItems} terms`}
            </p>
            {totalItems > PAGE_SIZE ? (
              <div className="join">
                <button
                  className="btn join-item"
                  type="button"
                  disabled={busy || page <= 1}
                  onClick={() => void fetchPage(page - 1, submittedQuery)}
                >
                  «
                </button>
                <button className="btn join-item" type="button" disabled>
                  Page {page} / {totalPages}
                </button>
                <button
                  className="btn join-item"
                  type="button"
                  disabled={busy || page >= totalPages}
                  onClick={() => void fetchPage(page + 1, submittedQuery)}
                >
                  »
                </button>
              </div>
            ) : null}
          </div>
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
