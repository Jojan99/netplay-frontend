import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { DialogService } from './dialog.service';
import { ToastService } from './toast.service';

/** Lo mínimo para poder ir a la ficha de alguien desde cualquier pantalla. */
export interface ClienteSenalado {
  user_id?: number | null;
  nombre?: string | null;
  cedula?: string | null;
}

/**
 * Ir a la ficha del cliente desde donde aparezca su nombre.
 *
 * El nombre está en media plataforma —cartera, tickets, avisos, la red— y
 * hasta ahora era texto muerto: para ver a quién se le estaba cobrando o a
 * quién se le abrió el ticket había que ir a Clientes y buscarlo de nuevo.
 *
 * Pregunta antes de moverse porque en esas pantallas el clic ya hace otra
 * cosa (abre la cartera, abre el ticket) y un salto de pantalla sin avisar
 * hace perder lo que se estaba mirando.
 */
@Injectable({ providedIn: 'root' })
export class FichaClienteService {
  private router = inject(Router);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  /** Si este operador puede ver fichas de clientes. */
  get permitido(): boolean {
    return this.auth.isAdmin() || this.auth.getAllowedModules().includes('usuario');
  }

  async abrir(c: ClienteSenalado, tab?: string): Promise<void> {
    if (!c?.user_id) {
      this.toast.info('Este registro no tiene un cliente asociado.');
      return;
    }

    if (!this.permitido) {
      this.toast.error('No tiene permiso para ver la ficha de clientes.');
      return;
    }

    const nombre = (c.nombre ?? '').trim();

    const ok = await this.dialog.confirm(
      nombre ? `¿Abrir la ficha de ${nombre}?` : '¿Abrir la ficha de este cliente?',
      { title: 'Ir al cliente', okLabel: 'Ver ficha', cancelLabel: 'Quedarme aquí' },
    );

    if (!ok) return;

    // La ficha se abre sola con ?cliente=<id>, pero sólo si el cliente cae en
    // la página que se carga: ?q=… deja la lista filtrada en él.
    const q = (c.cedula || nombre || '').toString().trim();

    this.router.navigate(['/dashboard/usuario'], { queryParams: { cliente: c.user_id, q, ...(tab ? { tab } : {}) } });
  }
}
