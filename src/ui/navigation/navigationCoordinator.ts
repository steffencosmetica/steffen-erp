export type NavigationPurpose = 'navigate' | 'logout';
export type NavigationDestination = () => void | Promise<void>;

interface EditorProtection {
  hasPending: () => boolean;
  intercepts: () => boolean;
  request: (destination: NavigationDestination, purpose: NavigationPurpose) => void;
  cancel: () => void;
}

/** Una instancia por Provider. El editor conserva diálogo, borradores y persistencia. */
export class NavigationCoordinator {
  private editor: { owner: symbol; protection: EditorProtection } | null = null;
  private version = 0;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  notify = () => { this.listeners.forEach((listener) => listener()); };
  hasPending = () => this.editor?.protection.hasPending() ?? false;
  intercepts = () => this.editor?.protection.intercepts() ?? false;

  register(protection: EditorProtection) {
    this.version++;
    this.editor?.protection.cancel();
    const owner = Symbol('order-editor');
    this.editor = { owner, protection };
    this.notify();
    return () => {
      if (this.editor?.owner !== owner) return;
      this.version++;
      this.editor = null;
      protection.cancel();
      this.notify();
    };
  }

  request = (destination: NavigationDestination, purpose: NavigationPurpose = 'navigate') => {
    const version = ++this.version;
    const editor = this.editor;
    if (!editor) { void destination(); return; }
    editor.protection.request(() => {
      if (this.version === version && this.editor === editor) return destination();
    }, purpose);
  };
}

export function requestProtectedLogout(event: Pick<Event, 'preventDefault'>, coordinator: NavigationCoordinator, submit: () => void) {
  event.preventDefault();
  coordinator.request(submit, 'logout');
}

/** Aviso nativo exclusivamente mientras hay borradores; nunca guarda durante unload. */
export function bindBeforeUnload(coordinator: NavigationCoordinator, target: Pick<Window, 'addEventListener' | 'removeEventListener'>) {
  let attached = false;
  const listener = (event: BeforeUnloadEvent) => {
    if (!coordinator.hasPending()) return;
    event.preventDefault();
    event.returnValue = ''; // Compatibilidad legacy; el navegador elige texto y acciones.
  };
  const update = () => {
    const pending = coordinator.hasPending();
    if (pending === attached) return;
    attached = pending;
    if (attached) target.addEventListener('beforeunload', listener);
    else target.removeEventListener('beforeunload', listener);
  };
  const unsubscribe = coordinator.subscribe(update);
  update();
  return () => {
    unsubscribe();
    if (attached) target.removeEventListener('beforeunload', listener);
    attached = false;
  };
}

export function internalLinkDestination(event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>,
  link: { href: string; target: string; download: boolean; external: boolean }, currentHref: string): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if ((link.target && link.target.toLowerCase() !== '_self') || link.download || link.external) return null;
  const current = new URL(currentHref);
  const next = new URL(link.href, currentHref);
  if (!['http:', 'https:'].includes(next.protocol) || next.origin !== current.origin) return null;
  // Un ancla del documento actual no desmonta el editor.
  if (next.pathname === current.pathname && next.search === current.search && next.hash) return null;
  return `${next.pathname}${next.search}${next.hash}`;
}

export function bindInternalLinks(coordinator: NavigationCoordinator, target: Pick<Document, 'addEventListener' | 'removeEventListener'>,
  currentHref: () => string, navigate: (href: string) => void) {
  const listener = (event: MouseEvent) => {
    if (!coordinator.intercepts()) return;
    const element = event.target instanceof Element ? event.target : null;
    const link = element?.closest<HTMLAnchorElement>('a[href]');
    if (!link) return;
    const destination = internalLinkDestination(event, {
      href: link.getAttribute('href')!, target: link.getAttribute('target') ?? '',
      download: link.hasAttribute('download'), external: link.relList.contains('external'),
    }, currentHref());
    if (destination === null) return;
    // Antes de los handlers de Link: Next no debe iniciar su transición todavía.
    event.preventDefault();
    event.stopPropagation();
    coordinator.request(() => navigate(destination));
  };
  target.addEventListener('click', listener, true);
  return () => target.removeEventListener('click', listener, true);
}
