import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FacturaElectronicaService } from '../../services/factura-electronica.service';
import { UbicacionClienteComponent } from '../ubicacion-cliente/ubicacion-cliente.component';

/**
 * Lo que la DIAN pide del cliente para la factura electrónica: tipo de
 * documento, dígito de verificación, tipo de persona, municipio y estrato
 * (del que depende si se le cobra IVA). Se abre plegado: la mayoría de los
 * suscriptores son cédula y persona natural, y no hay nada que tocar.
 */
@Component({
  selector: 'app-datos-fiscales',
  standalone: true,
  imports: [CommonModule, FormsModule, UbicacionClienteComponent],
  template: `
    <section>
      <p class="np-sect">Factura electrónica
        <button type="button" class="np-link" (click)="alternar()">{{ abierto ? 'Ocultar' : 'Datos fiscales' }}</button>
      </p>
      <div class="np-panel" *ngIf="abierto">
        <div *ngIf="cargando" class="np-loading np-loading--inline"><span class="np-spinner np-spinner--sm"></span> Cargando…</div>
        <form class="np-form" *ngIf="!cargando" (ngSubmit)="guardar()">
          <label class="np-field"><span>Tipo de documento</span>
            <select class="np-input" [(ngModel)]="f.tipo_documento" name="tipo_documento" (ngModelChange)="alCambiarTipo()">
              <option value="CC">Cédula de ciudadanía</option><option value="TI">Tarjeta de identidad</option><option value="CE">Cédula de extranjería</option>
              <option value="PPT">Permiso por protección temporal</option><option value="PEP">Permiso especial de permanencia</option><option value="PP">Pasaporte</option>
              <option value="DIE">Documento de identificación extranjero</option><option value="NIT">NIT</option>
            </select>
            <small class="np-fine df-falta" *ngIf="sinDefinir">Este cliente no tiene el tipo definido: confírmelo con su documento y guarde.</small>
          </label>
          <label class="np-field" *ngIf="f.tipo_documento === 'NIT'"><span>Dígito de verificación</span>
            <input class="np-input np-mono" [(ngModel)]="f.dv" name="dv" maxlength="1" inputmode="numeric" /></label>
          <label class="np-field"><span>Tipo de persona</span>
            <select class="np-input" [(ngModel)]="f.tipo_persona" name="tipo_persona"><option value="natural">Natural</option><option value="juridica">Jurídica</option></select>
          </label>
          <label class="np-field"><span>Estrato</span>
            <select class="np-input" [(ngModel)]="f.estrato" name="estrato">
              <option [ngValue]="null">Sin definir</option><option *ngFor="let e of estratos" [ngValue]="e">{{ e }}</option>
            </select>
          </label>
          <label class="np-field"><span>Barrio</span>
            <input class="np-input" [(ngModel)]="f.barrio" name="barrio" maxlength="120" /></label>
          <!-- País, departamento, ciudad, código DANE e indicativo: de listas con buscador. -->
          <app-ubicacion-cliente [datos]="f" prefijo="df"></app-ubicacion-cliente>
          <div class="np-field np-field-full">
            <p class="np-notice" [ngClass]="error ? 'np-notice--danger' : 'np-notice--ok'" *ngIf="mensaje">{{ mensaje }}</p>
            <button type="submit" class="np-btn np-btn--primary np-btn--sm" [disabled]="guardando">{{ guardando ? 'Guardando…' : 'Guardar datos fiscales' }}</button>
          </div>
        </form>
      </div>
    </section>
  `,
})
export class DatosFiscalesComponent implements OnChanges {
  private svc = inject(FacturaElectronicaService);

  @Input() userId: number | string | null = null;

  abierto = false;
  cargando = false;
  guardando = false;
  mensaje = '';
  error = false;
  readonly estratos = [1, 2, 3, 4, 5, 6];
  f = { tipo_documento: 'CC', dv: '' as string | null, tipo_persona: 'natural', municipio: '' as string | null, estrato: null as number | null,
    barrio: '' as string | null, ciudad: '' as string | null, departamento: '' as string | null, pais: '' as string | null, prefijo_telefono: '' as string | null };
  /** La ciudad de la empresa: lo que se propone a quien no la tiene. */
  sugeridos: { ciudad?: string; departamento?: string; municipio?: string; pais?: string; prefijo_telefono?: string } = {};
  /** El cliente no tiene tipo de documento: se muestra «CC» pero nadie lo eligió. */
  sinDefinir = false;

  /** Al cambiar de cliente se pliega: no se queda mostrando los datos del anterior. */
  ngOnChanges(): void {
    this.abierto = false; this.mensaje = ''; this.sinDefinir = false;
    this.f = { tipo_documento: 'CC', dv: null, tipo_persona: 'natural', municipio: null, estrato: null, barrio: null, ciudad: null, departamento: null, pais: null, prefijo_telefono: null };
  }

  alternar(): void {
    this.abierto = !this.abierto;
    if (!this.abierto || !this.userId) return;
    const cliente = this.userId;
    this.cargando = true;
    this.svc.clienteFiscal(cliente).subscribe({
      next: (r: any) => {
        if (cliente !== this.userId) return;
        this.cargando = false;
        if (!r?.data) return;
        const { sugeridos, tipo_sin_definir, ...datos } = r.data;
        this.sugeridos = sugeridos ?? {};
        this.sinDefinir = !!tipo_sin_definir;
        this.f = { ...this.f, ...datos };
        // Quien no tiene ubicación recibe la de la empresa ya escrita: se guarda con un clic.
        for (const k of ['ciudad', 'departamento', 'municipio', 'pais', 'prefijo_telefono'] as const) {
          if (!this.f[k] && this.sugeridos[k]) this.f[k] = this.sugeridos[k]!;
        }
      },
      error: () => { this.cargando = false; this.mensaje = 'No se pudieron cargar los datos fiscales.'; this.error = true; },
    });
  }

  alCambiarTipo(): void {
    if (this.f.tipo_documento === 'NIT') this.f.tipo_persona = 'juridica';
    else this.f.dv = null;
  }

  guardar(): void {
    if (!this.userId) return;
    this.guardando = true;
    this.mensaje = '';
    this.svc.guardarClienteFiscal(this.userId, { ...this.f, municipio: this.f.municipio || null, dv: this.f.dv || null }).subscribe({
      next: (r: any) => { this.guardando = false; this.mensaje = r?.message ?? 'Guardado.'; this.error = !!r?.error; if (!r?.error) this.sinDefinir = false; },
      error: (e) => { this.guardando = false; this.error = true; this.mensaje = e?.error?.message ?? 'No se pudo guardar.'; },
    });
  }
}
