import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CuentaService } from '../../services/cuenta.service';

/**
 * Lo que se muestra en las pantallas de TR-069 cuando la empresa no tiene el
 * complemento: qué es, cuánto cuesta, qué sigue funcionando sin él y a dónde
 * escribir. Reemplaza a una pantalla llena de errores sueltos.
 */
@Component({
  selector: 'app-complemento-bloqueado',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="cb np-card">
      <p class="np-kicker">Complemento <b>/</b> TR-069</p>
      <h2>La gestión por TR-069 es un complemento de su plan</h2>
      <p class="cb-t">Con él cambia el WiFi del cliente, reinicia su equipo, ve el consumo y deja que la ONT se configure sola al instalar. Hoy no está activo en su cuenta.</p>
      <p class="cb-precio" *ngIf="precio()"><b>{{ precio() | currency:'COP':'symbol-narrow':'1.0-0' }}</b> al mes<ng-container *ngIf="hasta()"> · hasta {{ hasta() }} equipos</ng-container></p>
      <p class="np-fine" *ngIf="tramos().length > 1">Se cobra según los equipos que gestione:
        <ng-container *ngFor="let t of tramos(); let ultimo = last">hasta {{ t.hasta }}, {{ t.precio | currency:'COP':'symbol-narrow':'1.0-0' }}{{ ultimo ? '.' : '; ' }}</ng-container>
      </p>
      <ul>
        <li>Sin el complemento sigue autorizando ONT en la OLT, creando clientes, facturando, cortando y reactivando como siempre.</li>
        <li>Al instalar, el equipo se configura a mano en vez de automáticamente.</li>
      </ul>
      <a class="np-btn np-btn--primary" *ngIf="enlace()" [href]="enlace()" target="_blank" rel="noopener">Escribir a Netvula para activarlo</a>
      <p class="np-fine" *ngIf="!enlace()">Escríbanos por el canal de soporte de Netvula para activarlo.</p>
    </section>
  `,
  styles: [`
    .cb { max-width: 640px; margin: 8px auto; padding: 22px 24px; display: grid; gap: 10px; }
    .cb h2 { margin: 0; font-family: var(--font-display); font-size: 19px; font-weight: 600; color: var(--text); }
    .cb-t { margin: 0; color: var(--text-2); font-size: 13px; line-height: 1.5; }
    .cb-precio { margin: 0; font-size: 13px; color: var(--text-2); b { font-family: var(--font-mono); font-size: 18px; color: var(--text); margin-right: 4px; } }
    .cb ul { margin: 0; padding-left: 18px; color: var(--text-2); font-size: 12.5px; line-height: 1.5; }
    .cb .np-btn { justify-self: start; text-decoration: none; }
  `],
})
export class ComplementoBloqueadoComponent {
  readonly precio = computed(() => CuentaService.tr069()?.precio ?? null);
  readonly hasta  = computed(() => CuentaService.tr069()?.hasta ?? null);
  readonly tramos = computed(() => CuentaService.tr069()?.tramos ?? []);
  readonly enlace = computed(() => {
    const c = CuentaService.cuenta();
    const wa = c?.soporte?.whatsapp;
    if (wa) return `https://wa.me/${wa}?text=${encodeURIComponent('Hola, quiero activar el complemento TR-069 para ' + (c?.empresa || 'mi empresa') + '.')}`;
    return c?.soporte?.correo ? 'mailto:' + c.soporte.correo : null;
  });
}
