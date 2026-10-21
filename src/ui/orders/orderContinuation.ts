/** Protección local: nunca escribe por solicitar un destino. */
export class OrderContinuation {
  private version = 0;
  private pending: { variant: 'abandon' | 'continue'; run: () => void | Promise<void>; auxiliary: boolean; refresh: boolean; purpose: 'navigate' | 'logout' } | null = null;
  private busy = false;
  constructor(private readonly deps: {
    dirty: () => boolean;
    auxiliaryDirty: () => boolean;
    blocked: () => boolean;
    save: () => Promise<boolean>;
    discard: (auxiliary: boolean, refresh: boolean) => Promise<boolean>;
    changed: () => void;
    error: (message: string) => void;
  }) {}
  get decision() { return this.pending; }
  get resolving() { return this.busy; }
  get generation() { return this.version; }
  cancel = () => { this.version++; this.pending = null; this.deps.changed(); };
  request(run: () => void | Promise<void>, variant: 'abandon' | 'continue' = 'continue', auxiliary = false, refresh = false, purpose: 'navigate' | 'logout' = 'navigate') {
    this.cancel(); // Una nueva intención invalida incluso una continuación en vuelo.
    if (this.busy || this.deps.blocked()) return;
    if ((auxiliary ? false : this.deps.dirty()) || this.deps.auxiliaryDirty()) {
      this.pending = { run, variant, auxiliary, refresh, purpose };
      this.deps.changed();
    } else void run();
  }
  async resolve(choice: 'save' | 'discard') {
    const target = this.pending;
    if (!target || this.busy || this.deps.blocked()) return;
    if (choice === 'save' && this.deps.auxiliaryDirty()) {
      this.deps.error('Hay datos en Agregar producto. Confirme Agregar o descarte ese borrador antes de guardar y continuar.');
      this.cancel();
      return;
    }
    const version = ++this.version;
    this.pending = null;
    this.busy = true;
    this.deps.changed();
    try {
      const success = choice === 'save' ? await this.deps.save() : await this.deps.discard(target.auxiliary, target.refresh);
      if (!success || version !== this.version) return;
      if (choice === 'save' && (this.deps.dirty() || this.deps.auxiliaryDirty())) {
        this.deps.error('Quedan modificaciones pendientes. Revise el borrador antes de continuar.');
        return;
      }
      await target.run();
    } catch (error) {
      this.deps.error(error instanceof Error ? error.message : 'No se pudo continuar.');
    } finally { this.busy = false; this.deps.changed(); }
  }
}
