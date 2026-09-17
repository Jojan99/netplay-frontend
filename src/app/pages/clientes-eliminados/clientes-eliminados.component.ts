import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserService } from '../../services/user.service';

interface ClienteEliminado {
  id: number;
  alias: string;
  names: string;
  lastname: string;
  dni: string;
  phone: string;
  email: string;
  address: string;
  connection_type: 'static' | 'pppoe' | null;
  pppoe_user: string | null;
  router_id: number | null;
  plan_name: string | null;
  router_name: string | null;
  ip: string;
  eliminado_en: string | null;
  eliminado_registrado_en: string | null;
  eliminado_por: string | null;
  ip_ocupada: number;
}

/**
 * Clientes eliminados de la empresa y su reinstalación.
 *
 * Eliminar un cliente no borra su ficha: la deja inactiva y le quita el
 * servicio. Cuando el cliente vuelve a pedir el servicio, desde acá se lo
 * devuelve al registro sin volver a cargar todos sus datos.
 */
@Component({
  selector: 'app-clientes-eliminados',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './clientes-eliminados.component.html',
  styleUrl: './clientes-eliminados.component.scss',
  host: { class: 'np-console' },
})
export class ClientesEliminadosComponent implements OnInit {
  private userSvc = inject(UserService);

  clientes: ClienteEliminado[] = [];
  cargando = false;
  search   = '';

  page      = 1;
  perPage   = 12;
  total     = 0;
  lastPage  = 1;
  /** Precalculado: un getter que arma el arreglo en cada ciclo no deja respirar a la vista. */
  pageNumbers: number[] = [];

  // Reinstalación
  showModal = false;
  elegido: ClienteEliminado | null = null;
  reinstalando = false;
  /** Lo que el servidor avisó de la última reinstalación. */
  avisos: string[] = [];
  mensaje = '';
  mensajeTipo: 'ok' | 'error' = 'ok';

  private buscarTimer: any = null;

  trackCliente = (_: number, c: ClienteEliminado) => c.id;

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true;

    this.userSvc.clientesEliminados({ page: this.page, per_page: this.perPage, q: this.search.trim() }).subscribe({
      next: (res) => {
        this.cargando  = false;
        const d        = res?.data ?? {};
        this.clientes  = d.items ?? [];
        this.total     = d.total ?? 0;
        this.page      = d.page ?? 1;
        this.lastPage  = d.last_page ?? 1;
        this.pageNumbers = Array.from({ length: this.lastPage }, (_, i) => i + 1)
          .filter(p => p === 1 || p === this.lastPage || Math.abs(p - this.page) <= 2);
      },
      error: () => {
        this.cargando = false;
        this.clientes = [];
        this.aviso('No se pudo cargar la lista de clientes eliminados.', 'error');
      },
    });
  }

  onBuscar(): void {
    clearTimeout(this.buscarTimer);
    this.buscarTimer = setTimeout(() => { this.page = 1; this.cargar(); }, 350);
  }

  irA(p: number): void { if (p !== this.page) { this.page = p; this.cargar(); } }
  anterior(): void { if (this.page > 1) this.irA(this.page - 1); }
  siguiente(): void { if (this.page < this.lastPage) this.irA(this.page + 1); }

  // ── Reinstalar ─────────────────────────────────────────────────────────────

  abrirReinstalar(c: ClienteEliminado): void {
    this.elegido   = c;
    this.showModal = true;
  }

  cerrar(): void { this.showModal = false; this.elegido = null; }

  confirmarReinstalar(): void {
    if (!this.elegido || this.reinstalando) return;
    this.reinstalando = true;

    this.userSvc.reinstalarCliente(this.elegido.id).subscribe({
      next: (res) => {
        this.reinstalando = false;
        this.showModal    = false;
        this.elegido      = null;
        this.avisos       = res?.data?.avisos ?? [];
        this.aviso(res?.message ?? 'Cliente reinstalado.', res?.error ? 'error' : 'ok');
        this.cargar();
      },
      error: (err) => {
        this.reinstalando = false;
        this.showModal    = false;
        this.aviso(err?.error?.message ?? 'No se pudo reinstalar al cliente.', 'error');
      },
    });
  }

  private aviso(texto: string, tipo: 'ok' | 'error'): void {
    this.mensaje     = texto;
    this.mensajeTipo = tipo;
  }

  cerrarAviso(): void { this.mensaje = ''; this.avisos = []; }
}
