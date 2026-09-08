import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/**
 * Confirmaciones del sistema (reemplaza a window.confirm) con un modal np-*.
 * Uso: `if (!(await this.dialog.confirm('¿Eliminar?'))) return;`
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  current = signal<{ message: string; opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const prev = this.current();
      if (prev) prev.resolve(false);
      const auto = /eliminar|borrar|cancelar|quitar|finalizar|cerrar sesi/i.test(message);
      this.current.set({ message, opts: { danger: auto, okLabel: opts.okLabel ?? (auto ? 'Sí, continuar' : 'Aceptar'), cancelLabel: opts.cancelLabel ?? 'Cancelar', ...opts }, resolve });
    });
  }

  answer(v: boolean): void {
    const cur = this.current();
    this.current.set(null);
    cur?.resolve(v);
  }
}
