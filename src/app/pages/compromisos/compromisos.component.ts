import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FinanzasTabsComponent } from '../../components/finanzas-tabs/finanzas-tabs.component';
import { FinanceService } from '../../services/finance.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';
import { FichaClienteService } from '../../services/ficha-cliente.service';

/**
 * Finanzas › Compromisos (21-10-2026): quién prometió pagar, cuánto y para cuándo, en toda la
 * empresa. Antes sólo se veían de a uno, dentro de la cartera de cada cliente.
 */
@Component({
  selector: 'app-compromisos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FinanzasTabsComponent],
  templateUrl: './compromisos.component.html',
  styleUrls: ['../pagos/pagos.component.scss', './compromisos.component.scss'],
})
export class CompromisosComponent implements OnInit {
  private finanzas = inject(FinanceService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  private ficha = inject(FichaClienteService);

  estado = 'vigentes';
  busqueda = '';
  datos: any = null;
  cargando = false;
  ocupado = new Set<number>();
  private timer: any;

  readonly ESTADOS = [
    { id: 'vigentes', titulo: 'Vigentes' },
    { id: 'incumplidos', titulo: 'Incumplidos' },
    { id: 'cumplidos', titulo: 'Cumplidos' },
    { id: 'cancelados', titulo: 'Cancelados' },
    { id: 'todos', titulo: 'Todos' },
  ];

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true;
    this.finanzas.compromisos(this.estado, this.busqueda.trim()).subscribe({
      next: (r: any) => { this.cargando = false; this.datos = r?.data ?? null; },
      error: () => { this.cargando = false; this.toast.error('No se pudieron cargar los compromisos'); },
    });
  }

  elegir(e: string): void { this.estado = e; this.cargar(); }
  buscar(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.cargar(), 350); }

  conteo(e: string): number | null {
    const r = this.datos?.resumen;
    if (!r) return null;
    return ({ vigentes: r.vigentes, incumplidos: r.incumplidos, cumplidos: r.cumplidos, cancelados: r.cancelados } as any)[e] ?? null;
  }

  pesos(v: unknown): string { return '$ ' + Math.round(Number(v) || 0).toLocaleString('es-CO'); }

  /** «en 4 días», «mañana», «hoy», «hace 5 días». */
  cuando(dias: number): string {
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'mañana';
    if (dias === -1) return 'ayer';
    return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
  }

  verFicha(c: any): void { this.ficha.abrir({ user_id: c.user_id, nombre: c.cliente, cedula: c.dni }); }

  recordar(c: any): void {
    this.ocupado.add(c.id);
    this.finanzas.recordarPago(c.user_id).subscribe({
      next: (r: any) => { this.ocupado.delete(c.id); r?.status === 0 ? this.toast.success(r.message) : this.toast.error(r?.message || 'No se pudo enviar'); if (r?.status === 0) c.recordado = true; },
      error: (e: any) => { this.ocupado.delete(c.id); this.toast.error(e?.error?.message || 'No se pudo enviar'); },
    });
  }

  async cumplido(c: any): Promise<void> {
    if (!await this.dialog.confirm(`¿${c.cliente} cumplió lo que prometió? El compromiso se cierra como cumplido.`, { okLabel: 'Sí, cumplió' })) return;
    this.ocupado.add(c.id);
    this.finanzas.fulfillCommitment(c.id).subscribe({
      next: () => { this.ocupado.delete(c.id); this.toast.success('Compromiso cumplido'); this.cargar(); },
      error: (e: any) => { this.ocupado.delete(c.id); this.toast.error(e?.error?.message || 'No se pudo'); },
    });
  }

  async cancelar(c: any): Promise<void> {
    if (!await this.dialog.confirm(`Se cancela el compromiso de ${c.cliente}: ya no se le corta el servicio por esta promesa.`, { title: 'Cancelar compromiso', okLabel: 'Cancelar compromiso', danger: true })) return;
    this.ocupado.add(c.id);
    this.finanzas.cancelCommitment(c.id).subscribe({
      next: () => { this.ocupado.delete(c.id); this.toast.success('Compromiso cancelado'); this.cargar(); },
      error: (e: any) => { this.ocupado.delete(c.id); this.toast.error(e?.error?.message || 'No se pudo'); },
    });
  }
}
