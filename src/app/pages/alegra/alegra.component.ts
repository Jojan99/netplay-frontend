import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlegraService } from '../../services/alegra.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

type Vista = 'resumen' | 'aprobar' | 'facturas' | 'recurrentes' | 'por-facturar' | 'pagos' | 'contactos' | 'cuenta';
type Tono = 'ok' | 'warn' | 'danger' | 'info' | 'neutro';

/** Un grupo del cruce: qué significa que una factura esté así en los dos sistemas. */
interface Cruce { id: string; titulo: string; explica: string; tono: Tono; n: number; saldo: number; total: number; }

const CRUCES: Array<Omit<Cruce, 'n' | 'saldo' | 'total'>> = [
  { id: 'pagada_en_netvula', titulo: 'Pagadas en Netvula, abiertas en Alegra', explica: 'El cliente ya pagó y Alegra todavía la muestra por cobrar: falta registrar el pago allá.', tono: 'warn' },
  { id: 'anulada_en_netvula', titulo: 'Anuladas en Netvula, abiertas en Alegra', explica: 'La cuenta de cobro se anuló acá, pero la factura sigue viva ante la DIAN: requiere nota crédito.', tono: 'danger' },
  { id: 'pagada_en_alegra', titulo: 'Pagadas en Alegra, pendientes en Netvula', explica: 'En Alegra figura cobrada y acá no hay pago registrado.', tono: 'danger' },
  { id: 'pendiente_en_ambas', titulo: 'Pendientes en los dos', explica: 'El cliente la debe y así figura en ambos sistemas.', tono: 'info' },
  { id: 'pagada_en_ambas', titulo: 'Pagadas en los dos', explica: 'Coinciden: cobrada acá y allá.', tono: 'ok' },
  { id: 'sin_cuenta', titulo: 'Sin cuenta de cobro en Netvula', explica: 'El cliente existe, pero no hay una cuenta de cobro de esa fecha que le corresponda.', tono: 'neutro' },
  { id: 'sin_cliente', titulo: 'Cliente que no está en Netvula', explica: 'El documento del cliente de Alegra no aparece entre los clientes de Netvula.', tono: 'neutro' },
];

const NOMBRE_CRUCE: Record<string, { texto: string; tono: Tono }> = {
  pagada_en_netvula: { texto: 'Falta el pago en Alegra', tono: 'warn' },
  anulada_en_netvula: { texto: 'Anulada en Netvula', tono: 'danger' },
  pagada_en_alegra: { texto: 'Pagada sólo en Alegra', tono: 'danger' },
  pendiente_en_ambas: { texto: 'Pendiente en los dos', tono: 'info' },
  pagada_en_ambas: { texto: 'Coincide', tono: 'ok' },
  sin_cuenta: { texto: 'Sin cuenta de cobro', tono: 'neutro' },
  sin_cliente: { texto: 'Cliente no está', tono: 'neutro' },
};

/**
 * El módulo de Alegra.
 *
 * Muestra lo que la empresa tiene en Alegra —facturas, pagos, contactos, numeraciones— y lo
 * cruza con Netvula, que es donde de verdad se registran los pagos. La pregunta que responde
 * es dónde no coinciden los dos: lo cobrado acá que allá sigue por cobrar, lo anulado acá que
 * allá sigue vivo, y lo que se cobró acá y todavía no se ha facturado allá.
 *
 * Es de consulta: desde aquí no se crea ni se cambia nada en Alegra.
 */
@Component({
  selector: 'app-alegra',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './alegra.component.html',
  styleUrl: './alegra.component.scss',
  host: { class: 'np-console' },
})
export class AlegraComponent implements OnInit, OnDestroy {
  private svc = inject(AlegraService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  vista: Vista = 'resumen';
  cargando = true;
  conectado = false;
  negado = '';

  // ── Sincronización ──
  sync: any = { estado: 'nunca' };
  sincronizando = false;
  avance = '';
  private reloj: any;

  // ── Resumen ──
  r: any = null;
  cruces: Cruce[] = [];
  meses: Array<{ mes: string; etiqueta: string; total: number; saldo: number; alto: number; altoSaldo: number; n: number }> = [];
  dian: Array<{ nombre: string; n: number; tono: Tono }> = [];

  // ── Listas (cada pestaña con sus filtros y su página) ──
  fac = { estado: '', cruce: '', vencidas: false, q: '', desde: '', hasta: '', pagina: 1, total: 0, sumaTotal: 0, sumaSaldo: 0, filas: [] as any[], cargando: false };
  pf = { fecha: '', pagadas: '', marcados: false, q: '', pagina: 1, total: 0, sumaTotal: 0, desde: '', cortes: [] as any[], filas: [] as any[], cargando: false };
  pag = { q: '', pagina: 1, total: 0, sumaTotal: 0, filas: [] as any[], cargando: false };
  /** Facturas recurrentes: a quién le genera factura Alegra sola, y a quién no. */
  rec = { lado: '', alerta: '', q: '', pagina: 1, total: 0, filas: [] as any[], cargando: false, resumen: null as any };
  con = { vinculo: '', q: '', pagina: 1, total: 0, filas: [] as any[], cargando: false };
  cuenta: any = null;
  cargandoCuenta = false;

  // ── Bandeja de aprobación ──
  ban = { estado: 'propuesta', tipo: '', q: '', pagina: 1, total: 0, sumaTotal: 0, filas: [] as any[], cargando: false };
  /** Un cuadro por tipo de operación: cuántas esperan, si ya se estrenó y si va en automático. */
  tipos: Array<{ id: string; nombre: string; explica: string; pendientes: number; total: number; hechas: number; fallidas: number; estado: string; auto: boolean }> = [];
  bancos: any[] = [];
  medios: Array<{ id: string; nombre: string }> = [];
  bancoId = '';
  medioPago = 'transfer';
  porAprobar = 0;
  aplicando = 0;
  seleccionadas = 0;
  ocupado = false;
  private relojBandeja: any;

  readonly porPagina = 25;
  private espera: any;

  ngOnInit(): void { this.arrancar(); }

  ngOnDestroy(): void { clearTimeout(this.reloj); clearTimeout(this.espera); clearTimeout(this.relojBandeja); }

  // ── Arranque y sincronización ─────────────────────────────────────────────

  private arrancar(): void {
    this.cargando = true;
    this.svc.estado().subscribe({
      next: (x: any) => {
        this.cargando = false;
        this.conectado = !!x?.data?.conectado;
        this.leerSync(x?.data?.sincronizacion);

        if (!this.conectado) return;
        // Primera vez: no hay copia todavía, se trae sola.
        if (this.sync.estado === 'nunca') { this.sincronizar(); return; }
        this.cargarResumen();
        // Para que la pestaña muestre cuántas esperan aprobación sin tener que abrirla.
        this.cargarBandeja(true);
      },
      error: (e: any) => { this.cargando = false; this.negado = e?.error?.message ?? 'No se pudo abrir el módulo de Alegra.'; },
    });
  }

  private leerSync(s: any): void {
    this.sync = s ?? { estado: 'nunca' };
    this.sincronizando = this.sync.estado === 'en_curso';
    this.avance = this.sincronizando
      ? (this.sync.paso ?? 'Conectando') + (this.sync.total ? ` · ${this.sync.hechos ?? 0} de ${this.sync.total}` : '')
      : '';

    clearTimeout(this.reloj);
    if (this.sincronizando) this.reloj = setTimeout(() => this.seguirSync(), 3000);
  }

  private seguirSync(): void {
    this.svc.estado().subscribe({
      next: (x: any) => {
        const antes = this.sincronizando;
        this.leerSync(x?.data?.sincronizacion);

        if (antes && !this.sincronizando) {
          if (this.sync.estado === 'listo') { this.toast.success('Datos de Alegra actualizados'); this.recargarTodo(); }
          else if (this.sync.estado === 'error') { this.toast.error(this.sync.error || 'No se pudieron traer los datos de Alegra'); this.recargarTodo(); }
        }
      },
      error: () => { this.reloj = setTimeout(() => this.seguirSync(), 5000); },
    });
  }

  sincronizar(): void {
    if (this.sincronizando) return;
    this.sincronizando = true;
    this.avance = 'Conectando';

    this.svc.sincronizar().subscribe({
      next: (x: any) => {
        if (x?.error) { this.sincronizando = false; this.toast.error(x.message ?? 'No se pudo iniciar'); return; }
        this.leerSync(x?.data?.sincronizacion);
      },
      error: (e: any) => { this.sincronizando = false; this.toast.error(e?.error?.message ?? 'No se pudo iniciar'); },
    });
  }

  private recargarTodo(): void {
    this.cargarResumen();
    if (this.vista !== 'resumen') this.abrir(this.vista, true);
  }

  // ── Pestañas ──────────────────────────────────────────────────────────────

  abrir(v: Vista, forzar = false): void {
    this.vista = v;
    if (v === 'aprobar') this.cargarBandeja();
    if (v === 'facturas' && (forzar || !this.fac.filas.length)) this.cargarFacturas();
    if (v === 'recurrentes' && (forzar || !this.rec.filas.length)) this.cargarRecurrentes();
    if (v === 'por-facturar' && (forzar || !this.pf.filas.length)) this.cargarPorFacturar();
    if (v === 'pagos' && (forzar || !this.pag.filas.length)) this.cargarPagos();
    if (v === 'contactos' && (forzar || !this.con.filas.length)) this.cargarContactos();
    if (v === 'cuenta' && (forzar || !this.cuenta)) this.cargarCuenta(forzar);
  }

  /** Desde el resumen: abrir las facturas ya filtradas por ese grupo. */
  verCruce(id: string): void {
    this.fac = { ...this.fac, estado: '', cruce: id, vencidas: false, q: '', pagina: 1 };
    this.vista = 'facturas';
    this.cargarFacturas();
  }

  verVencidas(): void {
    this.fac = { ...this.fac, estado: '', cruce: '', vencidas: true, q: '', pagina: 1 };
    this.vista = 'facturas';
    this.cargarFacturas();
  }

  verAbiertas(): void {
    this.fac = { ...this.fac, estado: 'open', cruce: '', vencidas: false, q: '', pagina: 1 };
    this.vista = 'facturas';
    this.cargarFacturas();
  }

  // ── Resumen ───────────────────────────────────────────────────────────────

  private cargarResumen(): void {
    this.svc.resumen().subscribe({
      next: (x: any) => {
        const d = x?.data;
        if (!d) return;
        this.r = d;

        this.cruces = CRUCES.map(c => ({ ...c, n: Number(d.cruce?.[c.id]?.n ?? 0), saldo: Number(d.cruce?.[c.id]?.saldo ?? 0), total: Number(d.cruce?.[c.id]?.total ?? 0) }))
          .filter(c => c.n > 0);

        const techo = Math.max(1, ...(d.meses ?? []).map((m: any) => Number(m.total)));
        this.meses = (d.meses ?? []).map((m: any) => ({
          mes: m.mes, etiqueta: this.nombreMes(m.mes), n: Number(m.n), total: Number(m.total), saldo: Number(m.saldo),
          alto: Math.max(4, Math.round((Number(m.total) / techo) * 100)), altoSaldo: Math.round((Number(m.saldo) / techo) * 100),
        }));

        this.dian = Object.entries(d.dian ?? {}).map(([k, n]) => ({ nombre: this.nombreDian(k), n: Number(n), tono: /REJECT|ERROR/i.test(k) ? 'danger' as Tono : /ACCEPT/i.test(k) ? 'ok' as Tono : 'neutro' as Tono }));
      },
    });
  }

  // ── Facturas ──────────────────────────────────────────────────────────────

  cargarFacturas(): void {
    const f = this.fac;
    f.cargando = true;
    this.svc.facturas({ estado: f.estado, cruce: f.cruce, vencidas: f.vencidas, q: f.q.trim(), desde: f.desde, hasta: f.hasta, pagina: f.pagina }).subscribe({
      next: (x: any) => {
        f.cargando = false;
        f.total = x?.data?.total ?? 0; f.sumaTotal = x?.data?.suma_total ?? 0; f.sumaSaldo = x?.data?.suma_saldo ?? 0;
        const hoy = new Date().toISOString().slice(0, 10);
        f.filas = (x?.data?.facturas ?? []).map((a: any) => ({
          ...a,
          vencida: a.estado === 'open' && a.vence && a.vence < hoy,
          cruceTexto: NOMBRE_CRUCE[a.cruce]?.texto ?? a.cruce, cruceTono: NOMBRE_CRUCE[a.cruce]?.tono ?? 'neutro',
          enNetvula: !a.det_id ? null : a.anulada_en ? 'Anulada' : Number(a.paid) === 1 ? 'Pagada' : 'Pendiente',
          enlace: 'https://app.alegra.com/invoice/view/id/' + a.alegra_id,
        }));
      },
      error: () => { f.cargando = false; },
    });
  }

  filtroFacturas(estado: string, vencidas = false): void {
    this.fac.estado = estado; this.fac.vencidas = vencidas; this.fac.pagina = 1;
    this.cargarFacturas();
  }

  // ── Bandeja de aprobación ─────────────────────────────────────────────────

  private static readonly EXPLICA: Record<string, string> = {
    registrar_pago: 'El cliente ya pagó en Netvula y la factura sigue abierta en Alegra.',
    nota_credito: 'La cuenta de cobro se anuló en Netvula y la factura sigue viva ante la DIAN.',
    quitar_recurrente: 'Alegra deja de generarle factura a ese cliente cada mes.',
    crear_recurrente: 'Alegra empieza a generarle factura a ese cliente cada mes.',
    crear_contacto: 'El cliente existe en Netvula y todavía no en Alegra.',
  };

  cargarBandeja(silencio = false): void {
    const b = this.ban;
    if (!silencio) b.cargando = true;

    this.svc.operaciones({ estado: b.estado, tipo: b.tipo, q: b.q.trim(), pagina: b.pagina }).subscribe({
      next: (x: any) => {
        b.cargando = false;
        const d = x?.data ?? {};
        b.total = d.total ?? 0; b.sumaTotal = d.suma_total ?? 0;

        // Lo marcado se conserva al refrescar mientras la fila siga en la lista.
        const marcadas = new Set(b.filas.filter(f => f.sel).map(f => f.id));
        b.filas = (d.operaciones ?? []).map((o: any) => ({ ...o, sel: marcadas.has(o.id), nombreTipo: d.tipos?.[o.tipo] ?? o.tipo, detalle: this.detalleDe(o) }));
        this.contarSeleccion();

        const a = d.ajustes ?? {};
        this.bancoId = a.banco_id ?? '';
        this.medioPago = a.medio_pago ?? 'transfer';
        this.medios = Object.entries(d.medios ?? {}).map(([id, nombre]) => ({ id, nombre: String(nombre) }));

        const cuenta = (tipo: string, estado: string, campo: 'n' | 'total') => Number((d.conteos ?? []).find((c: any) => c.tipo === tipo && c.estado === estado)?.[campo] ?? 0);
        this.tipos = Object.entries(d.tipos ?? {}).map(([id, nombre]) => ({
          id, nombre: String(nombre), explica: AlegraComponent.EXPLICA[id] ?? '',
          pendientes: cuenta(id, 'propuesta', 'n'), total: cuenta(id, 'propuesta', 'total'), hechas: cuenta(id, 'hecha', 'n'), fallidas: cuenta(id, 'fallida', 'n'),
          estado: a.tipos?.[id] ?? 'sin_probar', auto: !!a.auto?.[id],
        }));
        this.porAprobar = this.tipos.reduce((s, t) => s + t.pendientes, 0);

        // Mientras haya algo viajando a Alegra, la lista se refresca sola.
        const antes = this.aplicando;
        this.aplicando = Number(d.aplicando ?? 0);
        clearTimeout(this.relojBandeja);
        if (this.aplicando > 0 && this.vista === 'aprobar') this.relojBandeja = setTimeout(() => this.cargarBandeja(true), 4000);
        if (antes > 0 && this.aplicando === 0) { this.toast.success('Alegra terminó de procesar lo aprobado'); this.cargarResumen(); }

        if (!this.bancos.length) this.svc.cuenta().subscribe({ next: (c: any) => { this.bancos = c?.data?.bancos ?? []; } });
      },
      error: () => { b.cargando = false; },
    });
  }

  /** Lo que el usuario necesita leer para decidir, según el tipo. */
  private detalleDe(o: any): string {
    const d = o.datos ?? {};
    switch (o.tipo) {
      case 'registrar_pago': return `Factura ${d.factura ?? o.alegra_factura_id} · pagada en Netvula (${d.cuenta_de_cobro ?? '—'}) · fecha del pago ${this.fecha(d.fecha)}`;
      case 'nota_credito': return `Factura ${d.factura ?? o.alegra_factura_id} · anulada en Netvula (${d.cuenta_de_cobro ?? '—'})${d.motivo ? ' · ' + d.motivo : ''}`;
      case 'quitar_recurrente': return `${d.motivo ?? ''}${d.proxima ? ' · su próxima factura sería el ' + this.fecha(d.proxima) : ''}`;
      case 'crear_recurrente': return `${d.plan ?? ''} · primera factura el ${this.fecha(d.inicio)}`;
      case 'crear_contacto': return `${d.tipo_documento ?? 'CC'} ${o.cliente_identificacion ?? ''} · ${d.direccion ?? ''} · ${d.telefono ?? ''}${d.email ? ' · ' + d.email : ''}`;
      default: return '';
    }
  }

  filtroBandeja(estado: string, tipo?: string): void {
    this.ban.estado = estado;
    if (tipo !== undefined) this.ban.tipo = tipo;
    this.ban.pagina = 1; this.ban.filas = [];
    this.cargarBandeja();
  }

  contarSeleccion(): void { this.seleccionadas = this.ban.filas.filter(f => f.sel).length; }

  marcarTodas(valor: boolean): void { this.ban.filas.forEach(f => f.sel = valor); this.contarSeleccion(); }

  private idsMarcados(): number[] { return this.ban.filas.filter(f => f.sel).map(f => f.id); }

  /** Aprobar es lo único que hace que algo se escriba en Alegra: siempre se pregunta antes. */
  async aprobar(ids: number[], resumen: string): Promise<void> {
    if (!ids.length || this.ocupado) return;

    const ok = await this.dialog.confirm(`${resumen}\n\nEsto escribe en su cuenta real de Alegra. ¿Aprobar?`, { title: 'Aprobar y enviar a Alegra', okLabel: 'Sí, aprobar', cancelLabel: 'Todavía no', danger: false });
    if (!ok) return;

    this.enviarAprobacion({ ids });
  }

  aprobarUna(o: any): void {
    this.aprobar([o.id], `${o.nombreTipo} — ${o.cliente_nombre} — ${this.plata(o.monto)}. ${o.detalle}`);
  }

  aprobarMarcadas(): void {
    const ids = this.idsMarcados();
    this.aprobar(ids, `Va a aprobar ${ids.length} operación(es) seleccionada(s).`);
  }

  async aprobarTodas(t: { id: string; nombre: string; pendientes: number; total: number }): Promise<void> {
    if (this.ocupado) return;
    const ok = await this.dialog.confirm(`${t.nombre}: las ${this.n(t.pendientes)} que esperan, por ${this.plata(t.total)}.\n\nEsto escribe en su cuenta real de Alegra. ¿Aprobar todas?`, { title: 'Aprobar todas', okLabel: 'Sí, aprobar todas', cancelLabel: 'Todavía no', danger: true });
    if (ok) this.enviarAprobacion({ tipo: t.id, todas: true });
  }

  private enviarAprobacion(cuerpo: { ids?: number[]; tipo?: string; todas?: boolean }): void {
    this.ocupado = true;
    this.svc.aprobar(cuerpo).subscribe({
      next: (x: any) => {
        this.ocupado = false;
        x?.error ? this.toast.warning(x.message ?? 'No se aprobó') : this.toast.success(x.message ?? 'Aprobado');
        this.ban.filas.forEach(f => f.sel = false);
        this.cargarBandeja();
      },
      error: (e: any) => { this.ocupado = false; this.toast.error(e?.error?.message ?? 'No se pudo aprobar'); },
    });
  }

  descartar(ids: number[]): void {
    if (!ids.length || this.ocupado) return;
    this.ocupado = true;
    this.svc.descartar(ids).subscribe({
      next: (x: any) => { this.ocupado = false; this.toast.success(x?.message ?? 'Descartado'); this.cargarBandeja(); },
      error: () => { this.ocupado = false; this.toast.error('No se pudo descartar'); },
    });
  }

  descartarMarcadas(): void { this.descartar(this.idsMarcados()); }

  restaurar(o: any): void {
    this.svc.restaurar([o.id]).subscribe({
      next: (x: any) => { x?.error ? this.toast.warning(x.message) : this.toast.success(x?.message ?? 'De vuelta en la bandeja'); this.cargarBandeja(); },
      error: () => this.toast.error('No se pudo devolver a la bandeja'),
    });
  }

  buscarPropuestas(): void {
    this.ocupado = true;
    this.svc.proponer().subscribe({
      next: (x: any) => { this.ocupado = false; this.toast.success(x?.message ?? 'Bandeja actualizada'); this.filtroBandeja('propuesta', ''); },
      error: () => { this.ocupado = false; this.toast.error('No se pudo revisar'); },
    });
  }

  /** «Miré en Alegra la primera y quedó bien»: habilita los lotes y el automático de ese tipo. */
  async verificar(t: { id: string; nombre: string }): Promise<void> {
    const ok = await this.dialog.confirm(`¿Ya revisó en Alegra que «${t.nombre}» quedó como debía?\n\nAl confirmar podrá aprobar varias a la vez y dejar este tipo en automático.`, { title: 'Confirmar que quedó bien', okLabel: 'Sí, quedó bien', cancelLabel: 'Todavía no' });
    if (!ok) return;

    this.svc.verificar(t.id).subscribe({
      next: (x: any) => { x?.error ? this.toast.error(x.message) : this.toast.success(x?.message ?? 'Habilitado'); this.cargarBandeja(); },
      error: () => this.toast.error('No se pudo confirmar'),
    });
  }

  async automatico(t: { id: string; nombre: string; auto: boolean }): Promise<void> {
    const encender = !t.auto;

    if (encender) {
      const ok = await this.dialog.confirm(`«${t.nombre}» quedará en automático: cada hora, lo que aparezca de este tipo se enviará a Alegra sin que nadie lo apruebe.\n\n¿Encender?`, { title: 'Dejar en automático', okLabel: 'Sí, automático', cancelLabel: 'No', danger: true });
      if (!ok) return;
    }

    this.svc.ajustes({ auto: { [t.id]: encender } }).subscribe({
      next: (x: any) => { x?.error ? this.toast.error(x.message) : this.toast.success(encender ? 'Quedó en automático' : 'Vuelve a requerir aprobación'); this.cargarBandeja(); },
      error: () => this.toast.error('No se pudo cambiar'),
    });
  }

  guardarBanco(): void {
    this.svc.ajustes({ banco_id: this.bancoId, medio_pago: this.medioPago }).subscribe({
      next: (x: any) => { x?.error ? this.toast.error(x.message) : this.toast.success('Guardado'); },
      error: () => this.toast.error('No se pudo guardar'),
    });
  }

  // ── Quitar o agregar a un cliente de las recurrentes (queda en la bandeja) ──

  async quitarRecurrente(x: any): Promise<void> {
    const ok = await this.dialog.confirm(`¿Dejar de facturarle a ${x.cliente_nombre} en Alegra?\n\nQueda como una petición en la bandeja: se hace cuando la apruebe.`, { title: 'Quitar factura recurrente', okLabel: 'Pasar a la bandeja', cancelLabel: 'Cancelar' });
    if (!ok) return;

    this.svc.quitarRecurrente(x.alegra_id).subscribe({
      next: (r: any) => { r?.error ? this.toast.error(r.message) : this.toast.success(r?.message ?? 'En la bandeja'); if (!r?.error) x.pedido = 'propuesta'; },
      error: () => this.toast.error('No se pudo pedir'),
    });
  }

  async agregarRecurrente(x: any): Promise<void> {
    const ok = await this.dialog.confirm(`¿Que Alegra le facture cada mes a ${x.cliente} por ${this.plata(x.monthly_price)}?\n\nQueda como una petición en la bandeja: se hace cuando la apruebe.`, { title: 'Agregar factura recurrente', okLabel: 'Pasar a la bandeja', cancelLabel: 'Cancelar' });
    if (!ok) return;

    this.svc.agregarRecurrente(x.user_id).subscribe({
      next: (r: any) => { r?.error ? this.toast.error(r.message) : this.toast.success(r?.message ?? 'En la bandeja'); if (!r?.error) x.pedido = 'propuesta'; },
      error: () => this.toast.error('No se pudo pedir'),
    });
  }

  // ── Crear en Alegra el contacto de un cliente de Netvula (queda en la bandeja) ──

  crearContacto(x: any): void {
    this.svc.crearContacto({ user_id: x.user_id }).subscribe({
      next: (r: any) => { r?.error ? this.toast.error(r.message) : this.toast.success(r?.message ?? 'En la bandeja'); if (!r?.error) x.pedido = 'propuesta'; },
      error: () => this.toast.error('No se pudo pedir'),
    });
  }

  async crearTodosLosContactos(): Promise<void> {
    const ok = await this.dialog.confirm(`Se pasará a la bandeja el contacto de cada cliente de Netvula que no está en Alegra (${this.n(this.con.total)}).\n\nNo se crea ninguno todavía: cada uno queda esperando su aprobación.`, { title: 'Pasar todos a la bandeja', okLabel: 'Pasar a la bandeja', cancelLabel: 'Cancelar' });
    if (!ok) return;

    this.ocupado = true;
    this.svc.crearContacto({ todos: true }).subscribe({
      next: (r: any) => { this.ocupado = false; r?.error ? this.toast.error(r.message) : this.toast.success(r?.message ?? 'En la bandeja'); this.cargarContactos(); this.cargarBandeja(true); },
      error: () => { this.ocupado = false; this.toast.error('No se pudo pedir'); },
    });
  }

  // ── Recurrentes ───────────────────────────────────────────────────────────

  cargarRecurrentes(): void {
    const l = this.rec;
    l.cargando = true;
    this.svc.recurrentes({ lado: l.lado, alerta: l.alerta, q: l.q.trim(), pagina: l.pagina }).subscribe({
      next: (x: any) => {
        l.cargando = false;
        const d = x?.data ?? {};
        l.total = d.total ?? 0;
        l.resumen = {
          total: d.total_recurrentes ?? 0, valor: d.valor_mensual ?? 0, proxima: d.proxima ?? null, sin: d.sin_recurrente ?? 0,
          suspendidos: Number(d.por_alerta?.suspendido?.n ?? 0), retirados: Number(d.por_alerta?.retirado?.n ?? 0),
          distintos: Number(d.por_alerta?.valor_distinto?.n ?? 0), ajenos: Number(d.por_alerta?.no_cliente?.n ?? 0),
        };
        const nombres: Record<string, { texto: string; tono: Tono }> = {
          ok: { texto: 'Cliente activo', tono: 'ok' }, suspendido: { texto: 'Suspendido en Netvula', tono: 'warn' },
          retirado: { texto: 'Retirado en Netvula', tono: 'danger' }, valor_distinto: { texto: 'Valor distinto al plan', tono: 'warn' },
          no_cliente: { texto: 'No es cliente de Netvula', tono: 'danger' },
        };
        l.filas = (d.filas ?? []).map((a: any) => ({ ...a, alertaTexto: nombres[a.alerta]?.texto ?? '', alertaTono: nombres[a.alerta]?.tono ?? 'neutro' }));
      },
      error: () => { l.cargando = false; },
    });
  }

  ladoRecurrentes(lado: string, alerta = ''): void {
    this.rec.lado = lado; this.rec.alerta = alerta; this.rec.pagina = 1; this.rec.filas = [];
    this.cargarRecurrentes();
  }

  // ── Por facturar ──────────────────────────────────────────────────────────

  cargarPorFacturar(): void {
    const p = this.pf;
    p.cargando = true;
    this.svc.porFacturar({ fecha: p.fecha, pagadas: p.pagadas, marcados: p.marcados, q: p.q.trim(), pagina: p.pagina }).subscribe({
      next: (x: any) => {
        p.cargando = false;
        p.total = x?.data?.total ?? 0; p.sumaTotal = x?.data?.suma_total ?? 0; p.desde = x?.data?.desde ?? '';
        p.cortes = x?.data?.cortes ?? [];
        p.filas = x?.data?.cuentas ?? [];
      },
      error: () => { p.cargando = false; },
    });
  }

  corte(fecha: string): void {
    this.pf.fecha = this.pf.fecha === fecha ? '' : fecha;
    this.pf.pagina = 1;
    this.cargarPorFacturar();
  }

  // ── Pagos y contactos ─────────────────────────────────────────────────────

  cargarPagos(): void {
    const p = this.pag;
    p.cargando = true;
    this.svc.pagos({ q: p.q.trim(), pagina: p.pagina }).subscribe({
      next: (x: any) => {
        p.cargando = false; p.total = x?.data?.total ?? 0; p.sumaTotal = x?.data?.suma_total ?? 0;
        p.filas = (x?.data?.pagos ?? []).map((a: any) => ({ ...a, deFacturas: (a.facturas ?? []).map((i: any) => i.numero).filter(Boolean).join(', ') }));
      },
      error: () => { p.cargando = false; },
    });
  }

  cargarContactos(): void {
    const c = this.con;
    c.cargando = true;
    this.svc.contactos({ vinculo: c.vinculo, q: c.q.trim(), pagina: c.pagina }).subscribe({
      next: (x: any) => { c.cargando = false; c.total = x?.data?.total ?? 0; c.filas = x?.data?.contactos ?? []; },
      error: () => { c.cargando = false; },
    });
  }

  vinculo(v: string): void { this.con.vinculo = v; this.con.pagina = 1; this.cargarContactos(); }

  cargarCuenta(refrescar = false): void {
    this.cargandoCuenta = true;
    this.svc.cuenta(refrescar).subscribe({
      next: (x: any) => {
        this.cargandoCuenta = false;
        if (x?.error) { this.toast.error(x.message ?? 'No se pudo consultar la cuenta'); return; }
        const d = x.data ?? {};
        // Primero lo que se usa: numeraciones de venta y electrónicas.
        d.numeraciones = (d.numeraciones ?? []).map((n: any) => ({ ...n, tipoTexto: this.nombreNumeracion(n.tipo) }))
          .sort((a: any, b: any) => Number(b.electronica) - Number(a.electronica) || String(a.nombre).localeCompare(String(b.nombre)));
        this.cuenta = d;
      },
      error: () => { this.cargandoCuenta = false; },
    });
  }

  // ── Búsqueda con pausa y paginación ───────────────────────────────────────

  buscar(cual: 'fac' | 'pf' | 'pag' | 'con' | 'rec' | 'ban'): void {
    clearTimeout(this.espera);
    this.espera = setTimeout(() => {
      this[cual].pagina = 1;
      ({ fac: () => this.cargarFacturas(), pf: () => this.cargarPorFacturar(), pag: () => this.cargarPagos(), con: () => this.cargarContactos(), rec: () => this.cargarRecurrentes(), ban: () => this.cargarBandeja() })[cual]();
    }, 350);
  }

  pagina(cual: 'fac' | 'pf' | 'pag' | 'con' | 'rec' | 'ban', delta: number): void {
    const l = this[cual];
    const ultima = Math.max(1, Math.ceil(l.total / this.porPagina));
    const nueva = Math.min(ultima, Math.max(1, l.pagina + delta));
    if (nueva === l.pagina) return;
    l.pagina = nueva;
    ({ fac: () => this.cargarFacturas(), pf: () => this.cargarPorFacturar(), pag: () => this.cargarPagos(), con: () => this.cargarContactos(), rec: () => this.cargarRecurrentes(), ban: () => this.cargarBandeja() })[cual]();
  }

  ultima(total: number): number { return Math.max(1, Math.ceil(total / this.porPagina)); }
  desdeFila(l: { pagina: number; total: number }): number { return l.total ? (l.pagina - 1) * this.porPagina + 1 : 0; }
  hastaFila(l: { pagina: number; total: number }): number { return Math.min(l.total, l.pagina * this.porPagina); }

  trackId = (_: number, x: any) => x.alegra_id ?? x.id ?? x.user_id ?? _;
  trackI = (i: number) => i;

  // ── Formato ───────────────────────────────────────────────────────────────

  /** Cantidades con punto de miles, como el resto de las cifras. */
  n(v: any): string { return (Number(v) || 0).toLocaleString('es-CO'); }

  plata(v: any): string {
    return '$ ' + Math.round(Number(v) || 0).toLocaleString('es-CO');
  }

  /** «$ 45,9 M» para las cifras grandes del resumen. */
  corta(v: any): string {
    const n = Number(v) || 0;
    if (Math.abs(n) >= 1_000_000) return '$ ' + (n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 }) + ' M';
    return this.plata(n);
  }

  fecha(iso: string | null): string {
    if (!iso) return '—';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a.slice(2)}`;
  }

  cuando(iso: string | null): string {
    if (!iso) return 'nunca';
    const f = new Date(iso);
    return f.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + ', ' + f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private nombreMes(mes: string): string {
    const [a, m] = mes.split('-');
    return ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1] + ' ' + a.slice(2);
  }

  nombreDian(k: string | null): string {
    return ({
      STAMPED_AND_ACCEPTED: 'Aceptada por la DIAN', STAMPED_AND_ACCEPTED_WITH_OBSERVATIONS: 'Aceptada con observaciones',
      STAMPED_AND_REJECTED: 'Rechazada por la DIAN', STAMPED_AND_WAITING_RESPONSE: 'Esperando a la DIAN', SIN_SELLO: 'Sin enviar a la DIAN',
    } as Record<string, string>)[k ?? 'SIN_SELLO'] ?? (k ?? '—');
  }

  private nombreNumeracion(t: string): string {
    return ({
      invoice: 'Factura de venta', creditNote: 'Nota crédito', debitNote: 'Nota débito', estimate: 'Cotización', remission: 'Remisión',
      transactionIn: 'Recibo de caja', transactionOut: 'Comprobante de pago', bill: 'Factura de proveedor', supportDocument: 'Documento soporte',
      purchaseOrder: 'Orden de compra', adjustmentNote: 'Nota de ajuste', incomeDebitNote: 'Nota débito en ingresos',
    } as Record<string, string>)[t] ?? t;
  }
}
