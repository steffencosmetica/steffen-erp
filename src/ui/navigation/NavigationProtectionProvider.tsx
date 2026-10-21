'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavigationCoordinator, bindBeforeUnload, bindInternalLinks } from './navigationCoordinator';

const NavigationProtectionContext = createContext<NavigationCoordinator | null>(null);

export function NavigationProtectionProvider({ children }: { children: React.ReactNode }) {
  const [coordinator] = useState(() => new NavigationCoordinator());
  const router = useRouter();
  useEffect(() => {
    const removeUnload = bindBeforeUnload(coordinator, window);
    const removeLinks = bindInternalLinks(coordinator, document, () => window.location.href, (href) => router.push(href));
    return () => { removeLinks(); removeUnload(); };
  }, [coordinator, router]);
  return <NavigationProtectionContext.Provider value={coordinator}>{children}</NavigationProtectionContext.Provider>;
}

export const useNavigationProtection = () => useContext(NavigationProtectionContext);

/** Las llamadas explícitas pasan por el mismo editor; refresh sigue siendo una relectura. */
export function useProtectedRouter() {
  const router = useRouter();
  const coordinator = useNavigationProtection();
  return useMemo(() => ({
    ...router,
    push: (...args: Parameters<typeof router.push>) => coordinator ? coordinator.request(() => router.push(...args)) : router.push(...args),
    replace: (...args: Parameters<typeof router.replace>) => coordinator ? coordinator.request(() => router.replace(...args)) : router.replace(...args),
    back: () => coordinator ? coordinator.request(() => router.back()) : router.back(),
    forward: () => coordinator ? coordinator.request(() => router.forward()) : router.forward(),
  }), [router, coordinator]);
}
