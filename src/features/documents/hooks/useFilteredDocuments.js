import { useEffect, useMemo, useState } from 'react';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function useFilteredDocuments(documents, search, typeFilter) {
  return useMemo(() => {
    const normalizedSearch = normalizeText(search);
    const hasSearch = normalizedSearch.length > 0;
    const hasType = typeFilter && typeFilter !== 'all';

    if (!hasSearch && !hasType) {
      return documents;
    }

    return documents.filter((document) => {
      if (hasType && document.docType !== typeFilter) {
        return false;
      }

      if (!hasSearch) {
        return true;
      }

      const searchableText = [
        document.title,
        document.rfc_emisor,
        document.rfc_receptor,
        document.rfcReceptor,
        document.uuid,
        document.fileName,
      ]
        .map(normalizeText)
        .join(' ');

      return searchableText.includes(normalizedSearch);
    });
  }, [documents, search, typeFilter]);
}

export function useDebouncedValue(value, delay = 250) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [value, delay]);

  return debouncedValue;
}
