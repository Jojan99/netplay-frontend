import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CuentaService, EstadoDeCuenta } from '../../services/cuenta.service';

const CERRADO = 'aviso_de_cuenta_cerrado';

/**
 * La franja del panel que avisa al administrador que la prueba está por vencer
 * o que hay un pago pendiente, antes de que el acceso se suspenda. El aviso
 * «falta poco» se puede cerrar por la sesión; el de «ya venció» no.
 */
@Component({
  selector: 'app-aviso-de-cuenta',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ac" *ngIf="cuenta && visible" [class.ac--urgente]="cuenta.nivel === 'urgente'" role="status">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 8v5M12 16.5v.5M4.5 19h15L12 5z"/></svg>
      <span class="ac-texto">{{ cuenta.mensaje }}</span>
      <a class="ac-accion" *ngIf="enlace" [href]="enlace" target="_blank" rel="noopener">Escribir a Netvula</a>
      <button type="button" class="ac-cerrar" *ngIf="cuenta.nivel === 'aviso'" (click)="cerrar()" aria-label="Cerrar aviso">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; flex-shrink: 0; }
    .ac { display: flex; align-items: center; gap: 10px; padding: 7px 16px; font-family: var(--font-body); font-size: 12.5px; font-weight: 600; color: var(--text-2); background: var(--warn-soft); border-bottom: 1px solid var(--warn); }
    .ac--urgente { background: var(--danger-soft); border-bottom-color: var(--danger); color: var(--text); }
    .ac svg { width: 16px; height: 16px; flex-shrink: 0; color: var(--warn); }
    .ac--urgente svg { color: var(--danger); }
    .ac-texto { flex: 1; min-width: 0; }
    .ac-accion { flex-shrink: 0; font-weight: 800; color: var(--accent); text-decoration: underline; white-space: nowrap; }
    .ac-cerrar { flex-shrink: 0; width: 24px; height: 24px; display: grid; place-items: center; border: 0; background: none; cursor: pointer; border-radius: 5px; }
    .ac-cerrar svg { width: 13px; height: 13px; color: var(--text-3); }
  `],
})
export class AvisoDeCuentaComponent implements OnInit {
  private cuentas = inject(CuentaService);

  cuenta: EstadoDeCuenta | null = null;
  visible = false;

  get enlace(): string | null {
    const wa = this.cuenta?.soporte?.whatsapp;
    if (wa) {
      return `https://wa.me/${wa}?text=${encodeURIComponent('Hola, escribo por la cuenta de ' + (this.cuenta?.empresa || 'mi empresa') + ' en Netvula.')}`;
    }
    return this.cuenta?.soporte?.correo ? 'mailto:' + this.cuenta.soporte.correo : null;
  }

  ngOnInit(): void {
    if (typeof localStorage === 'undefined') return;

    // La suscripción es asunto de quien administra la empresa: la franja no la ve el técnico
    // ni el contador. La consulta sí se hace para todos: de ahí sale si el TR-069 está activo.
    const esAdmin = localStorage.getItem('user_role') === 'ADMIN';

    this.cuentas.ver().subscribe({
      next: (c) => {
        this.cuenta = c;
        this.visible = esAdmin && !!c && (c.nivel === 'urgente' || (c.nivel === 'aviso' && !this.cerrado()));
      },
      error: () => { /* sin aviso: si está suspendida, el interceptor ya abrió su pantalla */ },
    });
  }

  cerrar(): void {
    this.visible = false;
    try { sessionStorage.setItem(CERRADO, '1'); } catch { /* sin almacenamiento */ }
  }

  private cerrado(): boolean {
    try { return sessionStorage.getItem(CERRADO) === '1'; } catch { return false; }
  }
}
