import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { NuevoTicketComponent } from '../../../soport-client/nuevo-ticket/nuevo-ticket.component';
import { recomendacionDeRed } from '../../shared/recomendacion';
import { FichaClienteService } from '../../../../services/ficha-cliente.service';
import { ToastService } from '../../../../services/toast.service';
import { BurbujaTicketComponent } from '../../../../common/burbuja-ticket/burbuja-ticket.component';
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
  imports: [CommonModule, OltNavComponent, NuevoTicketComponent, BurbujaTicketComponent],
  templateUrl: './olt-salud.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-salud.component.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltSaludComponent implements OnInit {
  private http = inject(HttpClient);
  private ficha = inject(FichaClienteService);
  private toast = inject(ToastService);

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

  verCliente(c: any) {
    this.ficha.abrir({ user_id: c?.user_id, nombre: c?.cliente || c?.descripcion });
  }

  /**
   * El ticket se arma acá y no en la cabeza del que lo escribe.
   *
   * El modal va al final de la página: es un overlay fijo y, metido en una
   * celda, el scroll de la tabla se lo come.
   */
  ticketPara: { userId: number; observacion: string } | null = null;

  crearTicket(c: any): void {
    if (!c?.user_id) { this.toast.info('Esa ONT no tiene cliente asignado.'); return; }

    this.ticketPara = {
      userId: c.user_id,
      observacion: recomendacionDeRed({
        cliente: c.cliente || c.descripcion, olt: c.olt, fsp: c.fsp, ont_id: c.ont_id, serial: c.serial,
        rx_prom: c.rx_prom ?? null, rx_min: c.rx_min ?? null, caidas: c.caidas ?? 0,
        apagado: c.muestras ? Math.round((c.muestras_offline || 0) * 100 / c.muestras) : null,
      }),
    };
  }

  ticketCreado(): void {
    this.ticketPara = null;
    this.toast.success('Ticket creado.');
  }
}
