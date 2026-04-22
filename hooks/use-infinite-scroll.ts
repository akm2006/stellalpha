import { type SetStateAction, useState, useCallback, useRef, useEffect } from 'react';

interface UseInfiniteScrollOptions<T> {
  fetchData: (cursor?: string) => Promise<{ data: T[]; nextCursor: string | null }>;
  initialData?: T[];
  limit?: number;
  rootMargin?: string;
  throttleMs?: number;
}

export function useInfiniteScroll<T>({ 
  fetchData, 
  initialData = [], 
  limit = 50, 
  rootMargin = '100px',
  throttleMs = 500
}: UseInfiniteScrollOptions<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const observer = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const cursorRef = useRef<string | null>(null);
  const fetchDataRef = useRef(fetchData);
  const lastFetchTime = useRef(0);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  const setCursorValue = useCallback((value: SetStateAction<string | null>) => {
    setCursor(previous => {
      const next = typeof value === 'function'
        ? (value as (previous: string | null) => string | null)(previous)
        : value;
      cursorRef.current = next;
      return next;
    });
  }, []);

  const setHasMoreValue = useCallback((value: SetStateAction<boolean>) => {
    setHasMore(previous => {
      const next = typeof value === 'function'
        ? (value as (previous: boolean) => boolean)(previous)
        : value;
      hasMoreRef.current = next;
      return next;
    });
  }, []);

  const loadMore = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchTime.current < throttleMs) return;
    
    if (loadingRef.current || !hasMoreRef.current) return;

    setLoading(true);
    setError(null);
    loadingRef.current = true;
    lastFetchTime.current = now;

    try {
      const result = await fetchDataRef.current(cursorRef.current || undefined);
      
      const newData = result.data;
      const nextCursor = result.nextCursor;

      setData(prev => [...prev, ...newData]);
      setCursorValue(nextCursor);
      
      setHasMoreValue(newData.length >= limit && !!nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more data');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [limit, setCursorValue, setHasMoreValue, throttleMs]);

  const lastElementRef = useCallback((node: HTMLElement | null) => {
    if (observer.current) observer.current.disconnect();
    if (!node || !hasMoreRef.current) return;
    
    observer.current = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        void loadMore();
      }
    }, {
      rootMargin
    });
    
    observer.current.observe(node);
  }, [loadMore, rootMargin]);

  // Reset function to reload from scratch
  const reset = useCallback(() => {
    setData([]);
    setCursorValue(null);
    setHasMoreValue(true);
    setError(null);
    lastFetchTime.current = 0;
  }, [setCursorValue, setHasMoreValue]);

  return {
    data,
    loading,
    error,
    hasMore,
    loadMore,
    lastElementRef,
    reset,
    setData,
    setCursor: setCursorValue,
    setHasMore: setHasMoreValue
  };
}
