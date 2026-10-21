'use client';

import React, { useRef } from 'react';
import { useNavigationProtection } from './NavigationProtectionProvider';
import { requestProtectedLogout } from './navigationCoordinator';

/** Conserva action y submitter originales. No envía el primer submit protegido. */
export function ProtectedLogoutForm({ action, className, children }: {
  action: () => Promise<void>; className?: string; children: React.ReactNode;
}) {
  const coordinator = useNavigationProtection();
  const allowed = useRef(false);
  return <form action={action} className={className} onSubmit={(event) => {
    if (allowed.current || !coordinator) return;
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    requestProtectedLogout(event, coordinator, () => {
      if (!form.isConnected) return;
      allowed.current = true;
      try { form.requestSubmit(submitter); }
      finally { allowed.current = false; }
    });
  }}>{children}</form>;
}
