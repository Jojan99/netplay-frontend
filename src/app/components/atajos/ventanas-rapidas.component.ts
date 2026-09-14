import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SanitizeHtmlPipe } from '../../common/pipes';
import { AtajosService, ICONOS, TIPOS_DE_VENTANA, TipoDeVentana, VentanaRapida } from '../../services/atajos.service';
import { VentanaRapidaComponent } from './ventana-rapida.component';

/**
 * Las ventanas rápidas abiertas y la fila de minimizadas. Van por debajo de
 * los modales (60-81) y de la ventana de tareas: son consultas de apoyo.
 */
@Component({
  selector: 'app-ventanas-rapidas',
  standalone: true,
  imports: [CommonModule, SanitizeHtmlPipe, VentanaRapidaComponent],
  styleUrls: ['./atajos.scss'],
  styles: [`
    .qw { position: fixed; width: 380px; max-width: calc(100vw - 32px); display: flex; flex-direction: column; max-height: min(74vh, 600px); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow-lg); overflow: hidden; animation: qw-entrar .16s ease-out; }
    .qw[hidden] { display: none; }
    .qw.is-arriba { border-color: var(--accent-line); }
    .qw-cabeza { display: flex; align-items: center; gap: 8px; padding: 7px 6px 7px 10px; background: var(--surface-2); border-bottom: 1px solid var(--line); cursor: grab; user-select: none; touch-action: none; }
    .qw-cabeza.is-arrastrando { cursor: grabbing; }
    .qw-titulo { flex: 1; min-width: 0; }
    .qw-titulo b { display: block; font-size: 12.5px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qw-titulo small { display: block; font-size: 10.5px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qw-cuerpo { padding: 12px; overflow-y: auto; }
    .qw-dock { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 58; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; max-width: calc(100vw - 200px); }
    .qw-dock button { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px 0 6px; border: 1px solid var(--line-strong); border-radius: 999px; background: var(--surface); color: var(--text); box-shadow: var(--shadow); font: 700 12px var(--font-body); cursor: pointer; }
    .qw-dock button:hover { border-color: var(--accent); }
    .qw-dock .at-ico { width: 22px; height: 22px; }
    @keyframes qw-entrar { from { opacity: 0; transform: translateY(6px) scale(.99); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .qw { animation: none; } }
  `],
  template: `
    @if (atajos.grande()) {
      @for (v of atajos.ventanas(); track v.id) {
        <section class="qw" role="dialog" [attr.aria-label]="tipos[v.tipo].titulo" [hidden]="v.min"
                 [class.is-arriba]="esLaDeArriba(v)" [style.left.px]="v.x" [style.top.px]="v.y" [style.z-index]="capa(v)"
                 (pointerdown)="atajos.enfocar(v.id)">
          <header class="qw-cabeza" [class.is-arrastrando]="arrastre?.id === v.id"
                  (pointerdown)="empezar($event, v)" (pointermove)="arrastrar($event)" (pointerup)="soltar()" (pointercancel)="soltar()">
            <span class="at-ico" [innerHTML]="iconos[v.tipo] | sanitizeHtml"></span>
            <div class="qw-titulo">
              <b>{{ v.tipo === 'cliente' && v.cliente ? 'Cliente' : tipos[v.tipo].titulo }}</b>
              <small>{{ v.cliente?.nombre || tipos[v.tipo].sub }}</small>
            </div>
            <button type="button" class="at-icobtn" (click)="atajos.minimizar(v.id)" aria-label="Minimizar" title="Minimizar" [innerHTML]="iconos.minimizar | sanitizeHtml"></button>
            <button type="button" class="at-icobtn" (click)="atajos.cerrar(v.id)" aria-label="Cerrar" title="Cerrar" [innerHTML]="iconos.cerrar | sanitizeHtml"></button>
          </header>
          <div class="qw-cuerpo">
            <app-ventana-rapida [ventana]="v"></app-ventana-rapida>
          </div>
        </section>
      }

      @if (minimizadas().length) {
        <div class="qw-dock" aria-label="Ventanas minimizadas">
          @for (v of minimizadas(); track v.id) {
            <button type="button" (click)="atajos.restaurar(v.id)" [attr.aria-label]="'Abrir ' + tipos[v.tipo].titulo">
              <span class="at-ico" [innerHTML]="iconos[v.tipo] | sanitizeHtml"></span>
              {{ v.tipo === 'cliente' && v.cliente ? 'Cliente' : tipos[v.tipo].titulo }}{{ v.cliente ? ' · ' + primerNombre(v.cliente.nombre) : '' }}
            </button>
          }
        </div>
      }
    }
  `,
})
export class VentanasRapidasComponent {
  readonly atajos = inject(AtajosService);
  readonly tipos = TIPOS_DE_VENTANA;
  readonly iconos = ICONOS;

  arrastre: { id: number; dx: number; dy: number; x: number; y: number } | null = null;

  minimizadas(): VentanaRapida[] { return this.atajos.ventanas().filter(v => v.min); }

  esLaDeArriba(v: VentanaRapida): boolean {
    return v.orden === Math.max(...this.atajos.ventanas().filter(x => !x.min).map(x => x.orden));
  }

  /** 52-57: encima de la página y el encabezado, debajo de los modales. */
  capa(v: VentanaRapida): number {
    const ordenadas = [...this.atajos.ventanas()].sort((a, b) => a.orden - b.orden);
    return 52 + Math.min(5, ordenadas.findIndex(x => x.id === v.id));
  }

  primerNombre(n: string): string { return (n || '').split(' ')[0]; }

  empezar(e: PointerEvent, v: VentanaRapida): void {
    if ((e.target as HTMLElement).closest('button') || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.arrastre = { id: v.id, dx: e.clientX - v.x, dy: e.clientY - v.y, x: v.x, y: v.y };
  }

  arrastrar(e: PointerEvent): void {
    if (!this.arrastre) return;
    const x = Math.min(Math.max(8, e.clientX - this.arrastre.dx), window.innerWidth - 120);
    const y = Math.min(Math.max(58, e.clientY - this.arrastre.dy), window.innerHeight - 48);
    this.arrastre.x = x;
    this.arrastre.y = y;
    this.atajos.mover(this.arrastre.id, x, y);
  }

  soltar(): void {
    if (!this.arrastre) return;
    this.atajos.mover(this.arrastre.id, this.arrastre.x, this.arrastre.y, true);
    this.arrastre = null;
  }

  @HostListener('window:resize')
  alCambiarTamano(): void {
    for (const v of this.atajos.ventanas()) {
      const x = Math.min(v.x, window.innerWidth - 120);
      const y = Math.min(v.y, window.innerHeight - 48);
      if (x !== v.x || y !== v.y) this.atajos.mover(v.id, Math.max(8, x), Math.max(58, y), true);
    }
  }
}

/** Botón del encabezado con la lista de ventanas rápidas. */
@Component({
  selector: 'app-menu-de-ventanas',
  standalone: true,
  imports: [CommonModule, SanitizeHtmlPipe],
  styleUrls: ['./atajos.scss'],
  styles: [`
    :host { position: relative; display: block; }
    .mv-lista { position: absolute; right: 0; top: calc(100% + 8px); z-index: 61; width: 280px; padding: 6px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
    .mv-lista button { width: 100%; display: grid; grid-template-columns: 24px minmax(0, 1fr); gap: 10px; align-items: center; padding: 7px 8px; border: 0; border-radius: 6px; background: none; color: var(--text); text-align: left; cursor: pointer; }
    .mv-lista button:hover, .mv-lista button:focus-visible { background: var(--accent-soft); outline: none; }
    .mv-lista b { display: block; font-size: 12.5px; font-weight: 800; }
    .mv-lista small { display: block; font-size: 11.5px; color: var(--text-3); }
    .mv-cabeza { padding: 6px 8px 4px; font: 500 10px var(--font-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--text-3); }
  `],
  template: `
    <button type="button" class="np-icobtn" (click)="abierto = !abierto" [attr.aria-expanded]="abierto" aria-label="Ventanas rápidas" title="Ventanas rápidas"
            [innerHTML]="iconos.ventanas | sanitizeHtml"></button>
    @if (abierto) {
      <div class="mv-lista" role="menu">
        <div class="mv-cabeza">Ventanas rápidas</div>
        @for (t of disponibles(); track t.tipo) {
          <button type="button" role="menuitem" (click)="abrir(t.tipo)">
            <span class="at-ico" [innerHTML]="iconos[t.tipo] | sanitizeHtml"></span>
            <span><b>{{ t.titulo }}</b><small>{{ t.sub }}</small></span>
          </button>
        }
      </div>
    }
  `,
})
export class MenuDeVentanasComponent {
  readonly atajos = inject(AtajosService);
  private el = inject(ElementRef);
  readonly iconos = ICONOS;
  abierto = false;

  disponibles() {
    return (Object.keys(TIPOS_DE_VENTANA) as TipoDeVentana[])
      .filter(t => this.atajos.puedeAbrir(t))
      .map(tipo => ({ tipo, ...TIPOS_DE_VENTANA[tipo] }));
  }

  abrir(tipo: TipoDeVentana): void {
    this.abierto = false;
    this.atajos.abrirVentana(tipo);
  }

  @HostListener('document:click', ['$event'])
  fuera(e: Event): void { if (this.abierto && !this.el.nativeElement.contains(e.target)) this.abierto = false; }

  @HostListener('document:keydown.escape')
  escape(): void { this.abierto = false; }
}
