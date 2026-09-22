import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { SaludRedService } from '../../../../services/salud-red.service';
import { ToastService } from '../../../../services/toast.service';

/**
 * Salud de la red, en una sola pantalla.
 *
 * Tres preguntas, en el orden en que importan: cómo viene cada puerto, quién
 * está por quedarse sin servicio, y qué equipos se caen todo el día. Nada de
 * esto le pregunta nada a la OLT: sale de las mediciones que ya se tomaron,
 * así que se puede mirar cuantas veces haga falta.
 */
@Component({
  selector: 'app-olt-salud',
  standalone: true,
  imports: [CommonModule, OltNavComponent],
  templateUrl: './olt-salud.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-salud.component.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltSaludComponent implements OnInit {
  private api = inject(SaludRedService);
  private toast = inject(ToastService);
  private router = inject(Router);

  cargando = false;
  medidoEn: string | null = null;
  dias = 0;
  limite = -27;

  puertos: any[] = [];
  alBorde: any[] = [];
  inestables: any[] = [];

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true;
    this.api.resumen().subscribe({
      next: (r: any) => {
        this.cargando = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudo leer la salud de la red.'); return; }
        const d = r.data ?? {};
        this.puertos    = d.puertos ?? [];
        this.alBorde    = d.al_borde ?? [];
        this.inestables = d.inestables ?? [];
        this.medidoEn   = d.medido_en ?? null;
        this.dias       = d.dias ?? 0;
        this.limite     = d.limite ?? -27;
      },
      error: () => { this.cargando = false; this.toast.error('No se pudo leer la salud de la red.'); },
    });
  }

  /**
   * Cómo está un puerto, en una palabra.
   *
   * Lo que hace ruido no es la señal en sí sino la caída: un puerto que venía
   * en -22 y hoy está en -25 tiene algo pasando, aunque -25 todavía sirva.
   */
  estado(p: any): 'mal' | 'ojo' | 'bien' {
    if (p.offline > 0 || (p.rx_mediana !== null && p.rx_mediana < this.limite)) return 'mal';
    if (p.al_borde > 0 || (p.cambio !== null && p.cambio < -1.5)) return 'ojo';
    return 'bien';
  }

  etiqueta(p: any): string {
    return { mal: 'Atender', ojo: 'Mirar', bien: 'Bien' }[this.estado(p)];
  }

  /** Un puerto lleva a sus equipos; un cliente, a su ficha. */
  verPuerto(p: any): void {
    this.router.navigate(['/dashboard/olt/autorizadas'], { queryParams: { olt: p.olt_id, fsp: p.fsp } });
  }

  verCliente(c: any): void {
    if (!c.user_id) return;
    this.router.navigate(['/dashboard/usuario'], { queryParams: { cliente: c.user_id, tab: 'servicios' } });
  }

  porPuerto(_: number, p: any): string { return `${p.olt_id}:${p.fsp}`; }
  porEquipo(_: number, e: any): string { return `${e.olt_id}:${e.fsp}:${e.ont_id}`; }
}
