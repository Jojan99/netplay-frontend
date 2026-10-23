import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../../../services/inventory.service';
import { CodigoLeido, LectorDeCodigosComponent } from '../../../../components/lector-de-codigos/lector-de-codigos.component';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';

type Linea = { clave: number; itemId: number | null; cantidad: number | null; seriales: string[]; precio: number | null; leyendo: boolean };

/** Los ítems del catálogo, agrupados por categoría y con su código a la izquierda. */
const PRESENTACION_ITEMS: PresentacionSelect = {
  valor: i => i?.id,
  etiqueta: i => i?.nombre ?? '',
  prefijo: i => i?.codigo || null,
  grupo: i => i?.categoria || 'Sin categoría',
  detalle: i => (i?.usa_serial ? 'por serial' : 'por cantidad') + ` · ${i?.en_bodega ?? 0} en bodega`,
  buscarEn: i => [i?.nombre, i?.codigo, i?.categoria, i?.marca].filter(Boolean).join(' '),
};

/** Hasta cuántos equipos con serial se reciben en una línea. */
const MAX_SERIALES = 200;

/**
 * Entradas a la bodega por ítems (21-10-2026). En una misma entrada van varios ítems (5 ONT ZTE
 * y 1 TV Box): de cada uno se elige el ítem del catálogo, la cantidad y, si se lleva por serial,
 * se pide un serial por cada equipo. Se escriben, se leen con la pistola (salta solo al siguiente)
 * o con la cámara. Todo entra junto o nada.
 */
@Component({
  selector: 'app-entrada-inventario',
  standalone: true,
  imports: [CommonModule, FormsModule, LectorDeCodigosComponent, NpSelectComponent],
  templateUrl: './entrada.component.html',
  styleUrls: ['./entrada.component.scss'],
})
export class EntradaInventarioComponent implements OnInit {
  private inv = inject(InventoryService);

  /** Los ítems del tablero (con código, categoría y si llevan serial). */
  @Input() items: any[] = [];
  /** El botón «Recibir» de una fila abre la entrada con ese ítem ya puesto. */
  @Input() deItem: { id: number } | null = null;
  @Output() cerrado = new EventEmitter<void>();
  @Output() guardado = new EventEmitter<string>();
  @Output() crearItem = new EventEmitter<void>();

  readonly presItems = PRESENTACION_ITEMS;
  lineas: Linea[] = [];
  nota = '';
  error = '';
  guardando = false;
  private siguiente = 1;

  ngOnInit(): void {
    this.agregar(this.deItem?.id ?? null);
  }

  item(l: Linea): any { return l.itemId ? this.items.find(i => i.id === l.itemId) ?? null : null; }

  agregar(itemId: number | null = null): void {
    const l: Linea = { clave: this.siguiente++, itemId: null, cantidad: null, seriales: [], precio: null, leyendo: false };
    this.lineas = [...this.lineas, l];
    if (itemId) { l.itemId = itemId; this.elegido(l); }
  }

  quitar(l: Linea): void { this.lineas = this.lineas.filter(x => x !== l); if (!this.lineas.length) this.agregar(); }

  /** Al elegir el ítem: su último costo como precio y, si lleva serial, un equipo para empezar. */
  elegido(l: Linea): void {
    const it = this.item(l);
    l.precio = it?.costo ? Number(it.costo) : null;
    l.leyendo = false;
    if (!l.cantidad) l.cantidad = 1;
    this.ajustarSeriales(l);
  }

  /** Tantas casillas de serial como la cantidad; lo ya escrito se conserva. */
  ajustarSeriales(l: Linea): void {
    if (!this.item(l)?.usa_serial) { l.seriales = []; return; }
    const n = Math.max(0, Math.min(MAX_SERIALES, Math.floor(Number(l.cantidad) || 0)));
    if (Number(l.cantidad) > MAX_SERIALES) l.cantidad = MAX_SERIALES;
    l.seriales = Array.from({ length: n }, (_, k) => l.seriales[k] ?? '');
  }

  llenos(l: Linea): number { return l.seriales.filter(s => s.trim()).length; }

  /** Un serial que se repite en la entrada, en esta línea o en otra. */
  repetido(s: string): boolean {
    const c = this.canon(s);
    return !!c && this.lineas.reduce((n, l) => n + l.seriales.filter(x => this.canon(x) === c).length, 0) > 1;
  }

  private canon(s: string): string { return (s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  normalizar(l: Linea, k: number): void { l.seriales[k] = (l.seriales[k] || '').trim().toUpperCase(); }

  /** La pistola escribe y manda Enter: se pasa a la casilla siguiente (o a la de la línea que sigue). */
  siguienteCasilla(l: Linea, k: number, ev: Event): void {
    ev.preventDefault();
    this.normalizar(l, k);
    const i = this.lineas.indexOf(l);
    const destino = k + 1 < l.seriales.length ? `en-s-${l.clave}-${k + 1}` : (this.lineas[i + 1]?.seriales.length ? `en-s-${this.lineas[i + 1].clave}-0` : null);
    if (destino) (document.getElementById(destino) as HTMLInputElement | null)?.focus();
  }

  alternarLector(l: Linea): void {
    const abrir = !l.leyendo;
    this.lineas.forEach(x => x.leyendo = false);
    l.leyendo = abrir;
  }

  /** Lo que lee la cámara va a la primera casilla vacía de esa línea. */
  alLeer(l: Linea, c: CodigoLeido, lector: LectorDeCodigosComponent): void {
    const s = (c.limpio || c.texto || '').trim().toUpperCase();
    if (!s) return;
    if (this.lineas.some(x => x.seriales.some(y => this.canon(y) === this.canon(s)))) { lector.rechazar(`${s} ya está en la entrada`); return; }
    const k = l.seriales.findIndex(x => !x.trim());
    if (k < 0) { lector.rechazar('Ya están todos: suba la cantidad para leer más'); return; }
    l.seriales[k] = s;
    const faltan = l.seriales.filter(x => !x.trim()).length;
    lector.confirmar(faltan ? `Serial ${k + 1} de ${l.seriales.length} · faltan ${faltan}` : 'Listos todos los seriales');
    if (!faltan) setTimeout(() => l.leyendo = false, 900);
  }

  /** Lo que le falta a la línea para poder entrar; vacío si está lista. */
  falta(l: Linea): string {
    const it = this.item(l);
    if (!it) return 'Elija el ítem';
    if (!(Number(l.cantidad) > 0)) return 'Escriba la cantidad';
    if (it.usa_serial) {
      const n = l.seriales.length - this.llenos(l);
      if (n) return n === 1 ? 'Falta 1 serial' : `Faltan ${n} seriales`;
      if (l.seriales.some(s => this.repetido(s))) return 'Hay un serial repetido';
    }
    return '';
  }

  subtotal(l: Linea): number { return (Number(l.cantidad) || 0) * (Number(l.precio) || 0); }

  get listo(): boolean { return this.lineas.length > 0 && this.lineas.every(l => !this.falta(l)); }

  get resumen(): string {
    const conItem = this.lineas.filter(l => this.item(l));
    if (!conItem.length) return 'Elija el primer ítem';
    const equipos = conItem.filter(l => this.item(l).usa_serial).reduce((n, l) => n + (Number(l.cantidad) || 0), 0);
    const unidades = conItem.filter(l => !this.item(l).usa_serial).reduce((n, l) => n + (Number(l.cantidad) || 0), 0);
    const total = conItem.reduce((n, l) => n + this.subtotal(l), 0);
    return [
      `${conItem.length} ${conItem.length === 1 ? 'ítem' : 'ítems'}`,
      equipos ? `${equipos} ${equipos === 1 ? 'equipo' : 'equipos'}` : '',
      unidades ? `${unidades} unidades` : '',
      total ? '$ ' + Math.round(total).toLocaleString('es-CO') : '',
    ].filter(Boolean).join(' · ');
  }

  dar(): void {
    if (!this.listo || this.guardando) return;
    this.guardando = true;
    this.error = '';
    this.inv.entradaLote({
      lineas: this.lineas.map(l => ({
        inventory_id: l.itemId!,
        ...(this.item(l).usa_serial ? { seriales: l.seriales.map(s => s.trim()) } : { cantidad: Number(l.cantidad) }),
        ...(l.precio ? { precio: Number(l.precio) } : {}),
      })),
      ...(this.nota.trim() ? { nota: this.nota.trim() } : {}),
    }).subscribe({
      next: (r: any) => {
        this.guardando = false;
        if (r?.error) { this.error = r.message || 'No se pudo registrar.'; return; }
        this.guardado.emit(r?.message || 'Entrada registrada.');
      },
      error: (e: any) => {
        this.guardando = false;
        const errores = e?.error?.errors;
        this.error = (errores ? String((Object.values(errores)[0] as any)?.[0] ?? '') : '') || e?.error?.message || 'No se pudo registrar.';
      },
    });
  }

  trackLinea = (_: number, l: Linea) => l.clave;
  trackK = (k: number) => k;
}
