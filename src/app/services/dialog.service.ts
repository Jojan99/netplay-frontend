import { Injectable, signal } from '@angular/core';

export interface OpcionDialogo {
  /** Lo que se devuelve al elegirla. */
  id: string;
  label: string;
  /** Aclaración debajo del título de la opción. */
  hint?: string;
  disabled?: boolean;
}

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

  /**
   * Elegir entre varias opciones, no solo sí/no.
   *
   * Hace falta cuando la decisión no es "seguir o cancelar" sino "por cuál de
   * estos caminos": por ejemplo, por qué canal de WhatsApp mandar una factura.
   */
  currentChoice = signal<{
    message: string;
    title?: string;
    options: OpcionDialogo[];
    resolve: (v: string | null) => void;
  } | null>(null);

  choose(message: string, options: OpcionDialogo[], title?: string): Promise<string | null> {
    return new Promise<string | null>(resolve => {
      const prev = this.currentChoice();
      if (prev) prev.resolve(null);
      this.currentChoice.set({ message, title, options, resolve });
    });
  }

  pick(id: string | null): void {
    const cur = this.currentChoice();
    this.currentChoice.set(null);
    cur?.resolve(id);
  }

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
