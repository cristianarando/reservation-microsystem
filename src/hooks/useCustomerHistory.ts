"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PortalAppointment,
  PortalHistoryPayload,
} from "@/types/portal";

interface ExtraHistoryState {
  ownerId: string;
  items: PortalAppointment[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

/**
 * Encapsulates customer past-appointment history cursor pagination and IntersectionObserver scroll loading.
 */
export function useCustomerHistory({
  userId,
  initialHistory,
  enabledForInfiniteScroll,
}: {
  userId?: string | null;
  initialHistory?: PortalHistoryPayload | null;
  enabledForInfiniteScroll: boolean;
}) {
  const [showHistoryOwner, setShowHistoryOwner] = useState<{
    ownerId: string | null;
    open: boolean;
  }>({ ownerId: null, open: false });

  const [extraPages, setExtraPages] = useState<ExtraHistoryState | null>(null);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);

  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const historySentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingHistoryRef = useRef(false);

  const showHistory = Boolean(
    userId && showHistoryOwner.ownerId === userId && showHistoryOwner.open
  );

  const setShowHistory = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      setShowHistoryOwner((prev) => {
        const currentOpen = Boolean(
          userId && prev.ownerId === userId && prev.open
        );
        const nextOpen =
          typeof updater === "function" ? updater(currentOpen) : updater;
        return { ownerId: userId ?? null, open: nextOpen };
      });
    },
    [userId]
  );

  const activeExtra =
    userId && extraPages?.ownerId === userId ? extraPages : null;

  const baseItems = useMemo(
    () => (userId ? initialHistory?.items || [] : []),
    [userId, initialHistory?.items]
  );

  const historyItems = useMemo(() => {
    if (!userId) return [];
    if (!activeExtra || activeExtra.items.length === 0) return baseItems;
    const baseIds = new Set(baseItems.map((i) => i.id));
    return [
      ...baseItems,
      ...activeExtra.items.filter((i) => !baseIds.has(i.id)),
    ];
  }, [userId, baseItems, activeExtra]);

  const historyCursor = !userId
    ? null
    : activeExtra
    ? activeExtra.nextCursor
    : initialHistory?.nextCursor ?? null;

  const historyHasMore = !userId
    ? false
    : activeExtra
    ? activeExtra.hasMore
    : Boolean(initialHistory?.hasMore);

  const historyTotalCount = !userId
    ? 0
    : activeExtra?.totalCount ?? initialHistory?.totalCount ?? baseItems.length;

  const loadMoreHistory = useCallback(async () => {
    if (
      !userId ||
      !historyHasMore ||
      !historyCursor ||
      loadingHistoryRef.current
    ) {
      return;
    }
    loadingHistoryRef.current = true;
    setHistoryLoadingMore(true);
    try {
      const res = await fetch(
        `/api/appointments/history?cursor=${encodeURIComponent(historyCursor)}&limit=6`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const page = (await res.json().catch(() => null)) as
        | {
            items?: PortalAppointment[];
            nextCursor?: string | null;
            hasMore?: boolean;
            totalCount?: number;
          }
        | null;
      if (!page || !Array.isArray(page.items)) return;

      const fetchedItems = page.items;
      setExtraPages((prev) => {
        const existingItems =
          prev && prev.ownerId === userId ? prev.items : baseItems;
        const seen = new Set(existingItems.map((a) => a.id));
        const nextRows = fetchedItems.filter((a) => !seen.has(a.id));
        return {
          ownerId: userId,
          items: [...existingItems, ...nextRows],
          nextCursor: page.nextCursor ?? null,
          hasMore: Boolean(page.hasMore),
          totalCount:
            typeof page.totalCount === "number"
              ? page.totalCount
              : prev?.totalCount,
        };
      });
    } catch (err) {
      console.error("Failed to fetch additional appointment history:", err);
    } finally {
      loadingHistoryRef.current = false;
      setHistoryLoadingMore(false);
    }
  }, [userId, historyHasMore, historyCursor, baseItems]);

  useEffect(() => {
    if (!showHistory || !enabledForInfiniteScroll || !historyHasMore) return;
    const node = historySentinelRef.current;
    const scrollRoot = historyScrollRef.current;
    if (!node || !scrollRoot || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreHistory();
        }
      },
      { root: scrollRoot, rootMargin: "20px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [showHistory, enabledForInfiniteScroll, historyHasMore, loadMoreHistory]);

  return {
    showHistory,
    setShowHistory,
    historyItems,
    historyHasMore,
    historyTotalCount,
    historyLoadingMore,
    historyScrollRef,
    historySentinelRef,
    loadMoreHistory,
  };
}
