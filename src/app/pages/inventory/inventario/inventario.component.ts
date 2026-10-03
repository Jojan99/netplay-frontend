import { Component, OnInit, QueryList, ViewChildren, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { InventoryService } from '../../../services/inventory.service';
import { ToastService } from '../../../services/toast.service';
import { DialogService } from '../../../services/dialog.service';
import { CodigoLeido, LectorDeCodigosComponent } from '../../../components/lector-de-codigos/lector-de-codigos.component';

type Vista = 'existencias' | 'tecnicos' | 'equipos' | 'asistente';
type Operacion = 'recibir' | 'entregar' | 'devolver' | 'salida' | 'ajuste';

interface Op {
  tipo: Operacion;
  item: any | null;
  conSeriales: boolean;
  seriales: string[];
  cantidad: number | null;
  tecnicoId: number | null;
  precio: number | null;
  referencia: string;
  nota: string;
  danado: boolean;
  contado: number | null;
  error: string;
  /** Un código de producto que no existe: se ofrece crearlo. */
  codigoNuevo: string;
}

const TITULOS: Record<Operacion, { titulo: string; boton: string; ruta: string; ayuda: string }> = {
  recibir:  { titulo: 'Recibir mercancía', boton: 'Registrar la entrada', ruta: 'entradas', ayuda: 'Lo que llega a la bodega. Con equipos, lea el serial de cada uno.' },
  entregar: { titulo: 'Entregar a un técnico', boton: 'Entregar', ruta: 'entregas', ayuda: 'Sale de la bodega y queda a nombre del técnico, con la fecha.' },
  devolver: { titulo: 'Recibir devolución', boton: 'Registrar la devolución', ruta: 'devoluciones', ayuda: 'Lo que el técnico trae de vuelta. Lo dañado no vuelve a la existencia.' },
  salida:   { titulo: 'Sacar de bodega', boton: 'Registrar la salida', ruta: 'salidas', ayuda: 'Venta, pérdida o baja. Para un técnico use «Entregar».' },
  ajuste:   { titulo: 'Ajustar por conteo', boton: 'Dejar en lo contado', ruta: 'ajustes', ayuda: 'Cuente lo que hay en la bodega y escríbalo: la existencia queda en ese número.' },
};

const ESTADOS: Record<string, { texto: string; tono: string }> = {
  agotado: { texto: 'Agotado', tono: 'danger' }, bajo: { texto: 'En el mínimo', tono: 'warn' }, por_agotarse: { texto: 'Se acaba pronto', tono: 'warn' },
  sobra: { texto: 'Hay de más', tono: 'info' }, quieto: { texto: 'Sin movimiento', tono: 'neutro' }, bien: { texto: 'Bien', tono: 'ok' },
};

const DONDE: Record<string, { texto: string; tono: string }> = {
  bodega: { texto: 'En bodega', tono: 'ok' }, tecnico: { texto: 'Con técnico', tono: 'warn' }, instalada: { texto: 'Instalado', tono: 'info' },
  danada: { texto: 'Dañado', tono: 'danger' }, baja: { texto: 'De baja', tono: 'neutro' },
};

/**
 * El inventario, en una sola pantalla.
 *
 * Antes era una lista de ítems con cantidades. Ahora responde lo que el encargado de la bodega
 * necesita saber sin hacer cuentas: qué se está acabando y para cuántos días alcanza, qué
 * tiene cada técnico y desde cuándo, y dónde está cada equipo por su serial. Los movimientos
 * se hacen leyendo códigos con el teléfono.
 */
@Component({
  selector: 'app-inventario',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LectorDeCodigosComponent],
  templateUrl: './inventario.component.html',
  styleUrl: './inventario.component.scss',
  host: { class: 'np-console' },
})
export class InventarioComponent implements OnInit {
  private svc = inject(InventoryService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  vista: Vista = 'existencias';
  cargando = true;
  error = '';

  resumen: any = null;
  items: any[] = [];
  visibles: any[] = [];
  tecnicos: any[] = [];
  recomendaciones: any[] = [];
  conIa = false;
  diasConTecnico = 15;

  filtro = '';
  filtroEstado = '';

  // ── Operación en curso (recibir, entregar, devolver, salida, ajuste) ──
  op: Op | null = null;
  guardando = false;
  comprobando = false;
  listaDeTecnicos: any[] = [];
  readonly TITULOS = TITULOS;

  // ── Ficha de un ítem (crear o editar) ──
  ficha: any | null = null;
  guardandoFicha = false;
  categorias: any[] = [];
  leyendoCodigoDeFicha = false;

  // ── Equipos por serial ──
  eq = { q: '', estado: '', pagina: 1, total: 0, filas: [] as any[], porEstado: {} as Record<string, number>, cargando: false };
  private espera: any;

  // ── Asistente ──
  chat: Array<{ rol: 'usuario' | 'asistente'; texto: string }> = [];
  pregunta = '';
  pensando = false;
  readonly SUGERIDAS = ['¿Qué debo pedir esta semana?', '¿Qué técnico tiene más equipos y hace cuánto?', '¿Qué mínimos me recomienda?', '¿Hay plata quieta en la bodega?'];

  ngOnInit(): void {
    this.cargar();
    this.svc.tecnicos().subscribe({ next: (r: any) => { this.listaDeTecnicos = r?.data ?? []; } });
    this.svc.getCategories().subscribe({ next: (r: any) => { this.categorias = r?.data ?? []; } });
  }

  // ── Tablero ───────────────────────────────────────────────────────────────

  cargar(): void {
    this.cargando = !this.resumen;
    this.svc.panel().subscribe({
      next: (r: any) => {
        this.cargando = false;
        const d = r?.data;
        if (!d) { this.error = r?.message ?? 'No se pudo cargar el inventario.'; return; }

        this.error = '';
        this.resumen = d.resumen;
        this.conIa = !!d.con_ia;
        this.diasConTecnico = d.dias_con_tecnico ?? 15;
        this.recomendaciones = d.recomendaciones ?? [];
        this.items = (d.items ?? []).map((i: any) => ({ ...i, estadoTexto: ESTADOS[i.estado]?.texto ?? i.estado, tono: ESTADOS[i.estado]?.tono ?? 'neutro' }));
        this.tecnicos = (d.tecnicos ?? []).map((t: any) => ({ ...t, abierto: false, tono: t.equipos_viejos > 0 ? 'warn' : 'ok' }));
        this.filtrar();
      },
      error: (e: any) => { this.cargando = false; this.error = e?.error?.message ?? 'No se pudo cargar el inventario.'; },
    });
  }

  filtrar(): void {
    const q = this.filtro.trim().toLowerCase();
    this.visibles = this.items.filter(i =>
      (!q || i.nombre.toLowerCase().includes(q) || (i.categoria ?? '').toLowerCase().includes(q)) &&
      (!this.filtroEstado || (this.filtroEstado === 'atencion' ? ['agotado', 'bajo', 'por_agotarse'].includes(i.estado) : i.estado === this.filtroEstado)));
  }

  soloAtencion(): void { this.vista = 'existencias'; this.filtroEstado = this.filtroEstado === 'atencion' ? '' : 'atencion'; this.filtrar(); }

  abrir(v: Vista): void {
    this.vista = v;
    if (v === 'equipos' && !this.eq.filas.length) this.cargarEquipos();
  }

  // ── Operaciones ───────────────────────────────────────────────────────────

  iniciar(tipo: Operacion, item: any = null, tecnicoId: number | null = null): void {
    this.op = {
      tipo, item, conSeriales: !!item?.usa_serial, seriales: [], cantidad: null, tecnicoId,
      precio: null, referencia: '', nota: '', danado: false, contado: item ? item.en_bodega : null, error: '', codigoNuevo: '',
    };
  }

  cerrarOp(): void { this.op = null; }

  elegirItem(id: number | string): void {
    if (!this.op) return;
    const item = this.items.find(i => i.id === Number(id)) ?? null;
    this.op.item = item;
    this.op.conSeriales = !!item?.usa_serial;
    this.op.contado = item ? item.en_bodega : null;
    this.op.seriales = [];
    this.op.error = '';
    this.op.codigoNuevo = '';
  }

  /** Sólo se puede empezar a llevar por serial un ítem que todavía no tiene existencia suelta. */
  puedeUsarSeriales(i: any): boolean {
    return !!i && (i.usa_serial || (i.en_bodega === 0 && i.con_tecnicos === 0));
  }

  /** Un código leído cuando todavía no se sabe de qué producto se trata. */
  /** Los lectores de la ventana de operación: a ellos se les dice si la lectura sirvió. */
  @ViewChildren('lectorOp') lectoresOp?: QueryList<LectorDeCodigosComponent>;

  /**
   * Le contesta al lector qué pasó con lo que leyó: cartel verde con lo que se hizo, o
   * cartel rojo y tono grave con el motivo. Espera un instante porque al elegir el
   * producto la ventana cambia de lector.
   */
  private veredicto(bien: string): void {
    setTimeout(() => {
      const lector = this.lectoresOp?.first;
      if (!lector || !this.op) return;
      this.op.error ? lector.rechazar(this.op.error) : lector.confirmar(bien);
    }, 60);
  }

  alLeerProducto(c: CodigoLeido): void {
    const op = this.op;
    if (!op || this.comprobando) return;
    this.comprobando = true;
    op.error = '';
    op.codigoNuevo = '';

    this.svc.buscarCodigo(c.texto).subscribe({
      next: (r: any) => {
        this.comprobando = false;
        const d = r?.data;
        if (!this.op || !d) return;

        if (d.tipo === 'item') { this.elegirItem(d.item.id); this.veredicto(`Producto: ${d.item.name}`); return; }

        if (d.tipo === 'unidad') {
          // Leyó el serial de un equipo: con eso ya se sabe el producto.
          this.elegirItem(d.unidad.inventory_id);
          if (this.op.item) this.revisarSerial(d, c.limpio);
          this.veredicto(`Agregado ${c.limpio} · van ${this.op.seriales.length}`);
          return;
        }

        if (op.tipo === 'recibir' && !c.esMac) { op.codigoNuevo = c.texto.trim(); op.error = 'Ese código no es de ningún producto del inventario.'; this.veredicto(''); return; }
        op.error = c.esMac ? 'Eso es una MAC, no un código de producto.' : 'Ese código no está en el inventario.';
        this.veredicto('');
      },
      error: () => { this.comprobando = false; if (this.op) { this.op.error = 'No se pudo consultar el código.'; this.veredicto(''); } },
    });
  }

  /** Un serial leído para la operación en curso. */
  alLeerSerial(c: CodigoLeido): void {
    const op = this.op;
    if (!op?.item || !c.limpio) return;

    if (op.seriales.includes(c.limpio)) { op.error = `${c.limpio} ya está en la lista.`; this.veredicto(''); return; }

    this.svc.buscarCodigo(c.limpio).subscribe({
      next: (r: any) => {
        if (!this.op || !r?.data) return;
        this.revisarSerial(r.data, c.limpio);
        this.veredicto(`Agregado ${c.limpio} · van ${this.op.seriales.length}`);
      },
      error: () => { if (this.op) { this.op.error = 'No se pudo consultar el serial.'; this.veredicto(''); } },
    });
  }

  /** ¿Ese equipo sirve para lo que se está haciendo? */
  private revisarSerial(d: any, serial: string): void {
    const op = this.op!;
    const u = d.unidad;
    const donde = u ? ({ bodega: 'en bodega', tecnico: 'con ' + (u.tecnico || 'un técnico'), instalada: 'instalado donde un cliente', danada: 'marcado como dañado', baja: 'dado de baja' } as any)[u.estado] : '';

    if (op.tipo === 'recibir') {
      if (u) { op.error = `${u.serial} ya está en el inventario (${donde}).`; return; }
      if (d.tipo === 'item') { op.error = 'Eso es el código del producto, no el serial del equipo.'; return; }
    } else {
      if (!u) { op.error = `${serial} no está en el inventario: regístrelo primero como entrada.`; return; }
      if (u.inventory_id !== op.item.id) { op.error = `${u.serial} es de otro producto (${u.item}).`; return; }

      if (op.tipo === 'devolver') {
        if (u.estado !== 'tecnico') { op.error = `${u.serial} está ${donde}: no lo tiene ningún técnico.`; return; }
        // El primero que se lee dice de qué técnico es la devolución.
        if (!op.tecnicoId) op.tecnicoId = u.tecnico_id;
        if (u.tecnico_id !== op.tecnicoId) { op.error = `${u.serial} lo tiene ${u.tecnico}, no el técnico elegido.`; return; }
      } else if (u.estado !== 'bodega') { op.error = `${u.serial} está ${donde}: no se puede sacar de la bodega.`; return; }
    }

    const limpio = (u?.serial ?? serial);
    if (!op.seriales.includes(limpio)) op.seriales = [...op.seriales, limpio];
    op.conSeriales = true;
    op.error = '';
  }

  quitarSerial(s: string): void { if (this.op) this.op.seriales = this.op.seriales.filter(x => x !== s); }

  guardarOp(): void {
    const op = this.op;
    if (!op?.item || this.guardando) return;

    const cuerpo: Record<string, any> = { inventory_id: op.item.id, nota: op.nota.trim() || undefined };

    if (op.tipo === 'ajuste') {
      if (op.contado === null || op.contado < 0) { op.error = 'Escriba cuántos contó.'; return; }
      cuerpo['contado'] = op.contado;
    } else {
      if (op.conSeriales) {
        if (!op.seriales.length) { op.error = 'Lea al menos un serial.'; return; }
        cuerpo['seriales'] = op.seriales;
      } else {
        if (!op.cantidad || op.cantidad <= 0) { op.error = 'Escriba la cantidad.'; return; }
        cuerpo['cantidad'] = op.cantidad;
      }

      if (op.tipo === 'entregar' || op.tipo === 'devolver') {
        if (!op.tecnicoId) { op.error = 'Elija el técnico.'; return; }
        cuerpo['tecnico_id'] = op.tecnicoId;
      }
      if (op.tipo === 'recibir') { cuerpo['precio'] = op.precio ?? undefined; cuerpo['referencia'] = op.referencia.trim() || undefined; }
      if (op.tipo === 'devolver' || op.tipo === 'salida') cuerpo['danado'] = op.danado || undefined;
    }

    this.guardando = true;
    op.error = '';

    this.svc.operar(TITULOS[op.tipo].ruta, cuerpo).subscribe({
      next: (r: any) => {
        this.guardando = false;
        if (r?.error) { op.error = r.message ?? 'No se pudo registrar.'; return; }
        this.toast.success(r?.message ?? 'Registrado');
        this.op = null;
        this.cargar();
        if (this.eq.filas.length) this.cargarEquipos();
      },
      error: (e: any) => { this.guardando = false; op.error = e?.error?.message ?? this.primerError(e) ?? 'No se pudo registrar.'; },
    });
  }

  private primerError(e: any): string | null {
    const errores = e?.error?.errors;
    return errores ? String((Object.values(errores)[0] as any)?.[0] ?? '') || null : null;
  }

  // ── Ficha del ítem ────────────────────────────────────────────────────────

  nuevoItem(codigo = ''): void {
    this.ficha = { id: null, name: '', category_id: null, barcode: codigo, sku: '', unit: 'unidad', usa_serial: false, stock_min: 0, stock_max: null, unit_price: 0, location: '', quantity: 0, tieneExistencia: false };
    this.leyendoCodigoDeFicha = false;
  }

  editarItem(i: any): void {
    this.svc.getItem(i.id).subscribe({
      next: (r: any) => {
        const d = r?.data;
        if (!d) { this.toast.error('No se pudo abrir el ítem'); return; }
        this.ficha = {
          id: d.id, name: d.name, category_id: d.category_id ?? null, barcode: d.barcode ?? '', sku: d.sku ?? '', unit: d.unit ?? 'unidad', usa_serial: !!d.usa_serial,
          stock_min: Number(d.stock_min ?? 0), stock_max: d.stock_max !== null && d.stock_max !== undefined ? Number(d.stock_max) : null,
          unit_price: Number(d.unit_price ?? 0), location: d.location ?? '', tieneExistencia: i.en_bodega > 0 || i.con_tecnicos > 0, yaUsaSerial: !!d.usa_serial,
        };
        this.leyendoCodigoDeFicha = false;
      },
      error: () => this.toast.error('No se pudo abrir el ítem'),
    });
  }

  codigoDeFicha(c: CodigoLeido): void { if (this.ficha) { this.ficha.barcode = c.texto.trim(); this.leyendoCodigoDeFicha = false; } }

  guardarFicha(): void {
    const f = this.ficha;
    if (!f || this.guardandoFicha) return;
    if (!f.name?.trim()) { this.toast.error('Escriba el nombre del ítem'); return; }

    const cuerpo: any = {
      name: f.name.trim(), category_id: f.category_id || null, barcode: f.barcode?.trim() || null, sku: f.sku?.trim() || null,
      unit: f.unit?.trim() || 'unidad', usa_serial: !!f.usa_serial, stock_min: Number(f.stock_min) || 0,
      stock_max: f.stock_max === null || f.stock_max === '' ? null : Number(f.stock_max), unit_price: Number(f.unit_price) || 0, location: f.location?.trim() || null,
    };
    if (!f.id && !f.usa_serial) cuerpo.quantity = Number(f.quantity) || 0;

    this.guardandoFicha = true;
    (f.id ? this.svc.updateItem(f.id, cuerpo) : this.svc.createItem(cuerpo)).subscribe({
      next: (r: any) => {
        this.guardandoFicha = false;
        if (r?.error) { this.toast.error(r.message ?? 'No se pudo guardar'); return; }
        this.toast.success(f.id ? 'Ítem actualizado' : 'Ítem creado');
        const nuevoId = r?.data?.id;
        const venia = this.op?.codigoNuevo ? this.op : null;
        this.ficha = null;

        this.svc.panel().subscribe({
          next: (p: any) => {
            // Refresca la lista y, si se creó desde una operación, sigue con ese ítem.
            this.cargar();
            if (venia && nuevoId && this.op === venia) {
              const d = p?.data?.items?.find((x: any) => x.id === nuevoId);
              if (d) { this.items = [...this.items.filter(x => x.id !== nuevoId), { ...d, estadoTexto: ESTADOS[d.estado]?.texto, tono: ESTADOS[d.estado]?.tono }]; this.elegirItem(nuevoId); }
            }
          },
        });
      },
      error: (e: any) => { this.guardandoFicha = false; this.toast.error(e?.error?.message ?? this.primerError(e) ?? 'No se pudo guardar'); },
    });
  }

  async borrarItem(i: any): Promise<void> {
    const ok = await this.dialog.confirm(`¿Eliminar «${i.nombre}» del inventario? Su historial se conserva, pero deja de aparecer en la lista.`, { title: 'Eliminar ítem', okLabel: 'Sí, eliminar', danger: true });
    if (!ok) return;
    this.svc.deleteItem(i.id).subscribe({
      next: (r: any) => { r?.error ? this.toast.error(r.message ?? 'No se pudo eliminar') : this.toast.success('Ítem eliminado'); this.cargar(); },
      error: () => this.toast.error('No se pudo eliminar'),
    });
  }

  // ── Equipos por serial ────────────────────────────────────────────────────

  cargarEquipos(): void {
    const e = this.eq;
    e.cargando = true;
    this.svc.unidades({ q: e.q.trim(), estado: e.estado, pagina: e.pagina }).subscribe({
      next: (r: any) => {
        e.cargando = false;
        e.total = r?.data?.total ?? 0;
        e.porEstado = r?.data?.por_estado ?? {};
        e.filas = (r?.data?.unidades ?? []).map((u: any) => ({
          ...u, dondeTexto: DONDE[u.estado]?.texto ?? u.estado, tono: DONDE[u.estado]?.tono ?? 'neutro',
          dias: u.estado === 'tecnico' && u.entregada_en ? Math.floor((Date.now() - new Date(u.entregada_en).getTime()) / 86400000) : null,
        }));
      },
      error: () => { e.cargando = false; },
    });
  }

  buscarEquipo(): void { clearTimeout(this.espera); this.espera = setTimeout(() => { this.eq.pagina = 1; this.cargarEquipos(); }, 350); }
  estadoEquipo(e: string): void { this.eq.estado = this.eq.estado === e ? '' : e; this.eq.pagina = 1; this.cargarEquipos(); }
  paginaEquipo(d: number): void {
    const ultima = Math.max(1, Math.ceil(this.eq.total / 30));
    const n = Math.min(ultima, Math.max(1, this.eq.pagina + d));
    if (n !== this.eq.pagina) { this.eq.pagina = n; this.cargarEquipos(); }
  }
  ultimaDeEquipos(): number { return Math.max(1, Math.ceil(this.eq.total / 30)); }
  equipoLeido(c: CodigoLeido): void { this.eq.q = c.limpio; this.eq.pagina = 1; this.cargarEquipos(); }

  // ── Asistente ─────────────────────────────────────────────────────────────

  preguntar(texto?: string): void {
    const p = (texto ?? this.pregunta).trim();
    if (!p || this.pensando) return;

    const historial = this.chat.map(m => ({ rol: m.rol, texto: m.texto }));
    this.chat = [...this.chat, { rol: 'usuario', texto: p }];
    this.pregunta = '';
    this.pensando = true;

    this.svc.preguntarAlAsistente(p, historial).subscribe({
      next: (r: any) => { this.pensando = false; this.chat = [...this.chat, { rol: 'asistente', texto: r?.data?.respuesta ?? 'No hubo respuesta.' }]; },
      error: (e: any) => { this.pensando = false; this.chat = [...this.chat, { rol: 'asistente', texto: e?.status === 429 ? 'Demasiadas preguntas seguidas: espere un minuto.' : 'El asistente no pudo contestar. Intente de nuevo.' }]; },
    });
  }

  // ── Formato ───────────────────────────────────────────────────────────────

  n(v: any): string { return (Number(v) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 }); }
  plata(v: any): string { return '$ ' + Math.round(Number(v) || 0).toLocaleString('es-CO'); }
  fecha(iso: string | null): string {
    if (!iso) return '—';
    const f = new Date(iso);
    return isNaN(f.getTime()) ? '—' : f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' });
  }

  trackId = (_: number, x: any) => x.id ?? x.tecnico_id ?? _;
  trackI = (i: number) => i;
}
