import { useState, useCallback, useRef, useEffect } from 'react';

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
  rootMargin = '100px', // Tighter default
  throttleMs = 500      // Default throttle
}: UseInfiniteScrollOptions<T>) {
  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const observer = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef(false);
  const lastFetchTime = useRef(0); // Track last fetch timestamp

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const loadMore = useCallback(async () => {
    const now = Date.now();
    // Check throttle
    if (now - lastFetchTime.current < throttleMs) return;
    
    if (loadingRef.current || !hasMore) return;

    setLoading(true);
    setError(null);
    loadingRef.current = true;
    lastFetchTime.current = now; // Update timestamp

    try {
      const result = await fetchData(cursor || undefined);
      
      const newData = result.data;
      const nextCursor = result.nextCursor;

      setData(prev => [...prev, ...newData]);
      setCursor(nextCursor);
      
      if (newData.length < limit || !nextCursor) {
        setHasMore(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more data');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [cursor, fetchData, hasMore, limit, throttleMs]);

  const lastElementRef = useCallback((node: HTMLElement | null) => {
    if (loadingRef.current) return;
    
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
        // Double-check throttle before calling loadMore
        if (Date.now() - lastFetchTime.current >= throttleMs) {
          loadMore();
        }
      }
    }, {
      rootMargin
    });
    
    if (node) observer.current.observe(node);
  }, [loadMore, hasMore, rootMargin, throttleMs]);

  // Reset function to reload from scratch
  const reset = useCallback(() => {
    setData([]);
    setCursor(null);
    setHasMore(true);
    // Logic to reload initial data should be handled by the consumer effectively or by calling loadMore immediately if data is empty
  }, []);

  return {
    data,
    loading,
    error,
    hasMore,
    lastElementRef,
    reset,
    setData,
    setCursor,
    setHasMore
  };
}
