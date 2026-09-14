import { Component, DestroyRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { AtajosService, ClienteCorto } from '../../services/atajos.service';

/** Campo para elegir un cliente dentro de una ventana rápida. */
@Component({
  selector: 'app-selector-de-cliente',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./atajos.scss'],
  styles: [`
    :host { display: grid; gap: 6px; position: relative; }
    .sc-actual { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 32px; padding: 0 4px 0 10px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface-2); }
    .sc-actual b { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sc-lista { list-style: none; margin: 0; padding: 4px; display: grid; gap: 1px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); max-height: 220px; overflow-y: auto; }
    .sc-lista button { width: 100%; display: grid; gap: 1px; padding: 6px 8px; border: 0; border-radius: 5px; background: none; color: var(--text); text-align: left; cursor: pointer; }
    .sc-lista button:hover, .sc-lista button:focus-visible { background: var(--accent-soft); outline: none; }
    .sc-lista b { font-size: 12.5px; }
    .sc-lista small { font-size: 11.5px; color: var(--text-3); }
  `],
  template: `
    @if (cliente && !cambiando) {
      <div class="sc-actual">
        <b>{{ cliente.nombre }}</b>
        <button type="button" class="at-btn" (click)="cambiar()">Cambiar</button>
      </div>
    } @else {
      <label class="at-field" [attr.for]="idCampo">
        <span>Cliente</span>
        <input class="at-input" [id]="idCampo" type="text" autocomplete="off" [(ngModel)]="texto" (ngModelChange)="escribir$.next($event)"
               placeholder="Nombre, cédula, teléfono, IP o serial" (keydown.escape)="cancelar()">
      </label>
      @if (buscando) { <p class="at-muted">Buscando…</p> }
      @else if (error) { <p class="at-error">{{ error }}</p> }
      @else if (texto.trim().length >= 2 && !resultados.length) { <p class="at-vacio">Ningún cliente con ese dato.</p> }
      @if (resultados.length) {
        <ul class="sc-lista">
          @for (c of resultados; track c.id) {
            <li><button type="button" (click)="elegir(c)">
              <b>{{ c.nombre }}</b>
              <small class="at-mono">{{ c.dni }}{{ c.telefono ? ' · ' + c.telefono : '' }}{{ c.estado ? ' · ' + c.estado : '' }}</small>
            </button></li>
          }
        </ul>
      }
    }
  `,
})
export class SelectorDeClienteComponent {
  @Input() cliente: ClienteCorto | null = null;
  @Output() elegido = new EventEmitter<any>();

  private atajos = inject(AtajosService);
  private static cuenta = 0;
  readonly idCampo = `sc-cliente-${++SelectorDeClienteComponent.cuenta}`;

  texto = '';
  resultados: any[] = [];
  buscando = false;
  error = '';
  cambiando = false;
  readonly escribir$ = new Subject<string>();

  constructor() {
    this.escribir$.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap(q => {
        this.error = '';
        if (q.trim().length < 2) { this.buscando = false; return of(null); }
        this.buscando = true;
        return this.atajos.buscar(q.trim()).pipe(catchError(e => {
          this.error = e?.status === 403 ? 'Tu perfil no puede buscar clientes.' : 'No se pudo buscar. Probá de nuevo.';
          return of(null);
        }));
      }),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(res => {
      this.buscando = false;
      this.resultados = res?.data?.clientes ?? [];
    });
  }

  elegir(c: any): void {
    this.cambiando = false;
    this.texto = '';
    this.resultados = [];
    this.elegido.emit(c);
  }

  cambiar(): void { this.cambiando = true; }
  cancelar(): void { if (this.cliente) this.cambiando = false; }
}
