import { Component, DestroyRef, ElementRef, HostListener, ViewChild, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, of, switchMap } from 'rxjs';
import { SanitizeHtmlPipe } from '../../common/pipes';
import { AtajosService, ICONOS, TIPOS_DE_VENTANA, TipoDeVentana } from '../../services/atajos.service';

interface Resultado {
  grupo: string;
  titulo: string;
  sub: string;
  icono: string;
  hacer: () => void;
}

const normal = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Buscador con Ctrl+K: clientes, módulos del menú y ventanas rápidas en una
 * sola lista. Sólo en pantallas grandes (el servicio lo decide).
 */
@Component({
  selector: 'app-buscador-rapido',
  standalone: true,
  imports: [CommonModule, FormsModule, SanitizeHtmlPipe],
  templateUrl: './buscador-rapido.component.html',
  styleUrls: ['./atajos.scss', './buscador-rapido.component.scss'],
})
export class BuscadorRapidoComponent {
  readonly atajos = inject(AtajosService);
  private router = inject(Router);

  @ViewChild('campo') campo?: ElementRef<HTMLInputElement>;
  @ViewChild('lista') lista?: ElementRef<HTMLElement>;

  readonly iconos = ICONOS;
  texto = '';
  resultados: Resultado[] = [];
  sel = 0;
  buscandoClientes = false;
  private clientes: any[] = [];
  private escribir$ = new Subject<string>();

  constructor() {
    this.escribir$.pipe(
      debounceTime(220),
      switchMap(q => {
        if (q.trim().length < 2) { this.buscandoClientes = false; return of(null); }
        this.buscandoClientes = true;
        return this.atajos.buscar(q.trim()).pipe(catchError(() => of(null)));
      }),
      takeUntilDestroyed(inject(DestroyRef)),
    ).subscribe(res => {
      this.buscandoClientes = false;
      this.clientes = res?.data?.clientes ?? [];
      this.armar();
    });

    // Al abrir: campo vacío, lista inicial y foco en el texto.
    effect(() => {
      if (!this.atajos.buscadorAbierto()) return;
      this.texto = '';
      this.clientes = [];
      this.armar();
      setTimeout(() => this.campo?.nativeElement.focus());
    });
  }

  alEscribir(): void {
    this.clientes = [];
    this.armar();
    this.escribir$.next(this.texto);
  }

  /** Arma la lista con lo que hay: clientes (del servidor), puerto PON, ventanas y módulos. */
  private armar(): void {
    const q = normal(this.texto.trim());
    const r: Resultado[] = [];

    for (const c of this.clientes) {
      const ont = c.ont ? ` · ${c.ont.olt} ${c.ont.fsp}:${c.ont.ont_id}` : '';
      r.push({
        grupo: 'Clientes',
        titulo: c.nombre,
        sub: [c.dni, c.ip || c.pppoe, c.estado].filter(Boolean).join(' · ') + ont,
        icono: ICONOS.cliente,
        hacer: () => this.atajos.abrirVentana('cliente', { id: c.id, nombre: c.nombre }),
      });
    }

    const puerto = this.texto.trim().match(/^(\d+\/\d+\/\d+)$/);
    if (puerto && this.atajos.tieneModulo('olt-admin')) {
      r.push({
        grupo: 'Equipos', titulo: `Puerto PON ${puerto[1]}`, sub: 'ONT en línea de ese puerto', icono: ICONOS.puerto,
        hacer: () => this.router.navigate(['/dashboard/olt/online'], { queryParams: { puerto: puerto[1] } }),
      });
    }

    for (const [tipo, t] of Object.entries(TIPOS_DE_VENTANA) as [TipoDeVentana, typeof TIPOS_DE_VENTANA.cliente][]) {
      if (!this.atajos.puedeAbrir(tipo)) continue;
      if (q && !normal(`${t.titulo} ${t.sub} ventana`).includes(q)) continue;
      r.push({ grupo: 'Ventanas rápidas', titulo: t.titulo, sub: t.sub, icono: ICONOS[tipo], hacer: () => this.atajos.abrirVentana(tipo) });
    }

    // Sin texto: primero los favoritos. Con texto: cualquier módulo que coincida.
    const modulos = q
      ? this.atajos.modulos().filter(m => normal(`${m.titulo} ${m.grupo}`).includes(q))
      : this.atajos.misAtajos();
    for (const m of modulos.slice(0, 8)) {
      r.push({
        grupo: q ? 'Módulos' : 'Mis atajos', titulo: m.titulo, sub: m.grupo,
        icono: this.atajos.esFavorito(m.href) ? ICONOS.estrella : ICONOS.modulo,
        hacer: () => this.router.navigate(['/dashboard', ...m.href.split('/')]),
      });
    }

    this.resultados = r;
    this.sel = Math.min(this.sel, Math.max(0, r.length - 1));
    if (!q) this.sel = 0;
  }

  empiezaGrupo(i: number): boolean { return i === 0 || this.resultados[i - 1].grupo !== this.resultados[i].grupo; }

  elegir(i: number): void {
    const r = this.resultados[i];
    if (!r) return;
    this.atajos.cerrarBuscador();
    r.hacer();
  }

  @HostListener('document:keydown', ['$event'])
  teclas(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      if (!this.atajos.grande()) return;
      e.preventDefault();
      this.atajos.buscadorAbierto() ? this.atajos.cerrarBuscador() : this.atajos.abrirBuscador();
      return;
    }
    if (!this.atajos.buscadorAbierto()) return;

    if (e.key === 'Escape') { e.preventDefault(); this.atajos.cerrarBuscador(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.moverSeleccion(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.moverSeleccion(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); this.elegir(this.sel); }
  }

  private moverSeleccion(paso: number): void {
    if (!this.resultados.length) return;
    this.sel = (this.sel + paso + this.resultados.length) % this.resultados.length;
    setTimeout(() => this.lista?.nativeElement.querySelector('.is-sel')?.scrollIntoView({ block: 'nearest' }));
  }
}
