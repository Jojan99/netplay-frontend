import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { ToastService } from '../../../../services/toast.service';
import { environment } from '../../../../../environments/environment';

/**
 * Clientes que necesitan una decisión, separados por cuál.
 *
 * Hasta ahora la cartera y la salud de la red se miraban por separado, y
 * mezcladas no dicen nada: un cliente que debe y tiene el equipo apagado hace
 * días no es lo mismo que uno que debe y está navegando. Al primero lo
 * perseguís al pedo —ya se fue—; al segundo le cobrás.
 */
@Component({
  selector: 'app-olt-riesgo',
  standalone: true,
  imports: [CommonModule, OltNavComponent],
  templateUrl: './olt-riesgo.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-riesgo.component.scss', '../../shared/olt-movil.scss'],
})
export class OltRiesgoComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private router = inject(Router);

  cargando = false;
  error = '';
  medidoDesde: string | null = null;

  /** En el orden en que conviene atenderlos. */
  readonly orden = ['se_fue', 'falla_sin_reportar', 'inestable', 'senal_al_borde'];
  grupos: Record<string, any> = {};
  abierto: Record<string, boolean> = { se_fue: true };

  ngOnInit(): void { this.cargar(); }

  private cabeceras() {
    return { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    this.http.get<any>(`${environment.rootUrl}api/management/olt/clientes-en-riesgo`, { headers: this.cabeceras() })
      .subscribe({
        next: (r) => {
          this.cargando = false;
          if (r?.error === 1) { this.error = r?.message || 'No se pudo cargar.'; return; }
          this.grupos = r?.data?.grupos ?? {};
          this.medidoDesde = r?.data?.medido_desde ?? null;
          if (!this.medidoDesde) { this.error = 'Todavía no hay mediciones de red suficientes.'; }
        },
        error: (e) => { this.cargando = false; this.error = e?.error?.message ?? 'No se pudo cargar.'; },
      });
  }

  alternar(clave: string): void { this.abierto[clave] = !this.abierto[clave]; }

  /** Por id, para que abrir y cerrar no vuelva a dibujar todas las filas. */
  porCliente = (_: number, c: any) => c.user_id;

  plata(n: number): string {
    return '$ ' + Math.round(n || 0).toLocaleString('es-CO');
  }

  /**
   * La ficha se abre sola con ?cliente=<id>, pero sólo si el cliente viene en
   * la página que se carga: por eso va también ?q=… con la cédula (o el
   * nombre), que es lo que deja la lista filtrada en uno solo.
   */
  verCliente(c: any): void {
    const q = (c?.cedula || c?.nombre || '').toString().trim();
    this.router.navigate(['/dashboard/usuario'], { queryParams: { cliente: c.user_id, q } });
  }

  copiarTelefonos(grupo: any): void {
    const tels = (grupo?.clientes ?? []).map((c: any) => c.telefono).filter(Boolean);
    if (!tels.length) { this.toast.error('Ninguno tiene teléfono en la ficha.'); return; }
    navigator.clipboard?.writeText(tels.join('\n'));
    this.toast.success(`${tels.length} teléfonos copiados.`);
  }
}
