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
        this.calcularVisibles();
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

  /**
   * Los avisos que se ven con el filtro puesto.
   *
   * Es un campo, no un getter. Un getter que devuelve un array nuevo se
   * vuelve a evaluar en cada ciclo de detección, Angular ve una lista
   * distinta cada vez y rehace las filas: el clic se pierde entre que se
   * aprieta y se suelta, y el detalle no se abría nunca.
   */
  visibles: any[] = [];

  private calcularVisibles(): void {
    this.visibles = this.alertas.filter(a => {
      if (this.filtro === 'critico') return a.nivel === 'critico';
      if (this.filtro === 'senal') return a.tipo === 'senal';
      if (this.filtro === 'corte') return a.tipo === 'corte' || a.tipo === 'tunel' || a.tipo === 'olt';
      return true;
    });
  }

  /** Cambió el filtro desde los botones de arriba. */
  filtrar(filtro: 'todo' | 'critico' | 'senal' | 'corte'): void {
    this.filtro = filtro;
    this.calcularVisibles();
  }

  /** La lista no se rehace si los avisos son los mismos. */
  porId(_: number, a: any): number { return a?.id ?? _; }

  /** "hace 3 h": lo que importa de un aviso es desde cuándo pasa. */
  desde(fecha: string): string {
    const s = Math.max(0, (Date.now() - new Date(fecha).getTime()) / 1000);
    if (s < 120) return 'recién';
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    return `hace ${Math.round(s / 86400)} días`;
  }

  /**
   * El dibujo de cada tipo de aviso.
   *
   * Eran emojis: cada sistema los pinta distinto, en Windows la antena y el
   * enchufe se ven de colores que no son los nuestros, y en algunos ni
   * aparecen. Estos son trazos nuestros y siguen el color del texto.
   */
  trazo(tipo: string): string {
    return ({
      senal: 'M12 20h.01M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 14 0M1.5 9.4a15 15 0 0 1 21 0',
      corte: 'M6 3v12M18 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM18 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
      tunel: 'M9 2v6M15 2v6M7 8h10v5a5 5 0 0 1-10 0V8ZM12 18v4',
      olt:   'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
    } as any)[tipo] ?? 'M12 8v5M12 16h.01';
  }

  abrirCliente(a: any) {
    if (!a.user_id) return;
    this.router.navigate(['/dashboard/usuario'], { queryParams: { cliente: a.user_id, tab: 'servicios' } });
  }
}
