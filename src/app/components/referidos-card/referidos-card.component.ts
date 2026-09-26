import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../services/toast.service';
import { pesos } from '../../services/consola.service';

/**
 * "Invite a otro ISP": el código de referido de la empresa, su enlace y el
 * crédito que lleva ganado.
 *
 * Va abajo del centro de control del panel, al final: no estorba lo del día a
 * día pero está a mano. Si el programa está apagado o la consola todavía no
 * está migrada, la tarjeta no se muestra.
 */
@Component({
  selector: 'app-referidos-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="np-card np-referidos" *ngIf="mostrar">
      <div class="np-card-h">
        <h2>Invite a otro ISP</h2>
        <span class="np-card-meta" *ngIf="total">{{ activos }} de {{ total }} ya están pagando</span>
      </div>

      <p class="np-fine">
        Comparta su código con otro operador: él arranca con un descuento y a usted se le acredita
        {{ beneficioTexto }}{{ acreditarEn === 'primer_pago' ? ' cuando pague su primer período' : ' apenas se registre' }}.
      </p>

      <div class="np-referidos-fila">
        <div>
          <span class="np-kpi-l">Su código</span>
          <div class="np-mono np-referidos-codigo">{{ codigo }}</div>
        </div>
        <div>
          <span class="np-kpi-l">Crédito a favor</span>
          <div class="np-money np-money--lg">{{ pesos(credito) }}</div>
        </div>
        <div class="np-btnrow">
          <button type="button" class="np-btn np-btn--sm" (click)="copiar(codigo)">Copiar código</button>
          <button type="button" class="np-btn np-btn--sm np-btn--primary" (click)="copiar(enlace)">Copiar enlace</button>
        </div>
      </div>

      <p class="np-fine np-muted">El crédito se descuenta solo de su próxima factura de la plataforma.</p>
    </div>
  `,
  styles: [`
    .np-referidos-fila {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 18px;
      margin: 10px 0;
    }
    .np-referidos-codigo {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: .04em;
      color: var(--accent);
    }
    .np-referidos .np-btnrow { margin-left: auto; }
  `],
})
export class ReferidosCardComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  mostrar = false;
  codigo = '';
  enlace = '';
  credito = 0;
  total = 0;
  activos = 0;
  beneficioTexto = 'un crédito';
  acreditarEn = 'primer_pago';

  pesos = pesos;

  ngOnInit(): void {
    const cabeceras = new HttpHeaders({ 'Authorization': `Bearer ${localStorage.getItem('token') ?? ''}` });

    this.http.get<any>(`${environment.rootUrl}api/plataforma/mi-referido`, { headers: cabeceras }).subscribe({
      next: r => {
        const d = r?.data ?? {};
        if (!d.activo || !d.codigo) return;

        this.codigo = d.codigo;
        this.enlace = d.enlace;
        this.credito = d.credito ?? 0;
        this.total = d.total ?? 0;
        this.activos = d.activos ?? 0;
        this.acreditarEn = d.acreditar_en ?? 'primer_pago';

        const b = d.beneficio ?? null;
        if (b) {
          this.beneficioTexto = b.tipo === 'porcentaje'
            ? `el ${b.valor}% de lo que pague`
            : `${pesos(b.valor)} de crédito`;
        }

        this.mostrar = true;
      },
      // Sin programa de referidos la tarjeta simplemente no aparece.
      error: () => { this.mostrar = false; },
    });
  }

  copiar(texto: string): void {
    if (!texto) return;

    navigator.clipboard?.writeText(texto)
      .then(() => this.toast.success('Copiado.'))
      .catch(() => this.toast.error('No se pudo copiar. Seleccionalo y cópielo a mano.'));
  }
}
