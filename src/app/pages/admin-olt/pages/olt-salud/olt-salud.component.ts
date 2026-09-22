import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { environment } from '../../../../../environments/environment';

interface Puerto {
  olt_id: number; olt: string; fsp: string; onts: number; offline: number; al_borde: number;
  rx_mediana: number | null; rx_min: number | null; cambio: number | null; medido_en: string;
}

/**
 * Salud de la red: la señal ya se medía cada 15 minutos, pero se olvidaba.
 * Acá queda la tendencia, para ir a arreglar antes de que el cliente llame.
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
  private http = inject(HttpClient);
  private router = inject(Router);

  puertos: Puerto[] = [];
  alBorde: any[] = [];
  inestables: any[] = [];
  medidoEn: string | null = null;
  dias = 0;
  limite = -26;
  cargando = false;
  error = '';

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    this.error = '';
    this.http.get<any>(`${environment.rootUrl}api/management/red/salud`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
    }).subscribe({
      next: r => {
        this.cargando = false;
        const d = r?.data ?? {};
        this.puertos = d.puertos ?? [];
        this.alBorde = d.al_borde ?? [];
        this.inestables = d.inestables ?? [];
        this.medidoEn = d.medido_en ?? null;
        this.dias = d.dias ?? 0;
        this.limite = d.limite ?? -26;
      },
      error: () => { this.cargando = false; this.error = 'No se pudo cargar la salud de la red.'; },
    });
  }

  /** Cuántos puertos y clientes piden atención, para el encabezado. */
  get puertosEnRiesgo(): number { return this.puertos.filter(p => this.tonoPuerto(p) !== 'ok').length; }
  get conCortes(): number { return this.puertos.reduce((n, p) => n + (p.offline > 0 ? 1 : 0), 0); }

  /** Un puerto está mal si su mediana es baja o si arrastra varios clientes al borde. */
  tonoPuerto(p: Puerto): 'ok' | 'aviso' | 'malo' {
    const media = p.rx_mediana ?? 0;
    const porcentaje = p.onts ? p.al_borde / p.onts : 0;
    if (media <= -26 || porcentaje >= 0.25) return 'malo';
    if (media <= -24 || p.al_borde > 0) return 'aviso';
    return 'ok';
  }

  /** El cambio contra la semana pasada: negativo es que empeoró. */
  tonoCambio(c: number | null): 'ok' | 'aviso' | 'malo' | 'nada' {
    if (c === null) return 'nada';
    if (c <= -1) return 'malo';
    if (c <= -0.4) return 'aviso';
    return 'ok';
  }

  dbm(v: number | null | undefined): string { return v === null || v === undefined ? '—' : Number(v).toFixed(2); }

  /** El tiempo que estuvo apagado, en palabras: las muestras son de 15 minutos. */
  apagado(muestras: number): string {
    const minutos = (muestras || 0) * 15;
    if (!minutos) return '—';
    return minutos < 60 ? `${minutos} min` : `${Math.round(minutos / 60)} h`;
  }

  verCliente(userId: number | null) {
    if (userId) this.router.navigate(['/dashboard/usuario'], { queryParams: { cliente: userId } });
  }
}
