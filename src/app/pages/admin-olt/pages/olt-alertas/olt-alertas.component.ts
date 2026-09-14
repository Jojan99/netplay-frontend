import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { AlertasService } from '../../../../services/alertas.service';
import { ToastService } from '../../../../services/toast.service';

/**
 * Avisos de la red: lo que hay que mirar antes de que llame el cliente.
 *
 * La lista es lo que pasa ahora, no un historial: cada aviso se cierra solo
 * cuando la situación se arregla.
 */
@Component({
  selector: 'app-olt-alertas',
  standalone: true,
  imports: [CommonModule, FormsModule, OltNavComponent],
  templateUrl: './olt-alertas.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-alertas.component.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltAlertasComponent implements OnInit {
  private api = inject(AlertasService);
  private toast = inject(ToastService);
  private router = inject(Router);

  alertas: any[] = [];
  resumen: any = null;
  cargando = false;
  revisando = false;
  filtro: 'todo' | 'critico' | 'senal' | 'corte' = 'todo';
  historial = false;

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    this.api.lista(this.historial).subscribe({
      next: (r: any) => {
        this.cargando = false;
        if (r?.error !== 0) { this.toast.error(r?.message || 'No se pudieron leer los avisos.'); return; }
        this.alertas = r.data?.alertas ?? [];
        this.resumen = r.data?.resumen ?? null;
      },
      error: () => { this.cargando = false; },
    });
  }

  revisar() {
    this.revisando = true;
    this.api.revisar().subscribe({
      next: (r: any) => { this.revisando = false; this.toast.success(r?.message || 'Revisado'); this.cargar(); },
      error: () => { this.revisando = false; this.toast.error('No se pudo revisar.'); },
    });
  }

  marcarVistas() {
    this.api.marcarVistas().subscribe({ next: () => { this.toast.success('Marcados como vistos'); this.cargar(); } });
  }

  get visibles(): any[] {
    return this.alertas.filter(a => {
      if (this.filtro === 'critico') return a.nivel === 'critico';
      if (this.filtro === 'senal') return a.tipo === 'senal';
      if (this.filtro === 'corte') return a.tipo === 'corte' || a.tipo === 'tunel' || a.tipo === 'olt';
      return true;
    });
  }

  /** "hace 3 h": lo que importa de un aviso es desde cuándo pasa. */
  desde(fecha: string): string {
    const s = Math.max(0, (Date.now() - new Date(fecha).getTime()) / 1000);
    if (s < 120) return 'recién';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }

  icono(tipo: string): string {
    return ({ senal: '📶', corte: '✂️', tunel: '🔌', olt: '🖥️' } as any)[tipo] ?? '•';
  }

  abrirCliente(a: any) {
    if (!a.user_id) return;
    this.router.navigate(['/dashboard/usuario'], { queryParams: { cliente: a.user_id, tab: 'servicios' } });
  }
}
