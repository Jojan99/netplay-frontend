import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FinanzasTabsComponent } from '../../components/finanzas-tabs/finanzas-tabs.component';
import { PagosService } from '../../services/pagos.service';
import { PaymentProofService } from '../../services/payment-proof.service';
import { FinanceService } from '../../services/finance.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';
import { FichaClienteService } from '../../services/ficha-cliente.service';

type Vista = 'registrados' | 'revisar' | 'en-linea' | 'caja';

/**
 * Finanzas › Pagos (21-10-2026). Cuatro vistas de lo mismo, la plata que entra:
 *  - Registrados: cada pago, abono y reverso, con quién lo registró y por qué medio.
 *  - Por revisar: los comprobantes que llegan por WhatsApp, uno por uno, para aprobar o rechazar.
 *  - En línea: las pasarelas, los pagos sin terminar y los enlaces de pago.
 *  - Cuadre de caja: lo registrado en el día contra el banco o lo contado.
 */
@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FinanzasTabsComponent],
  templateUrl: './pagos.component.html',
  styleUrls: ['./pagos.component.scss'],
})
export class PagosComponent implements OnInit {
  private pagos = inject(PagosService);
  private comprobantes = inject(PaymentProofService);
  private finanzas = inject(FinanceService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  private ficha = inject(FichaClienteService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  vista: Vista = 'registrados';
  readonly VISTAS: Array<{ id: Vista; titulo: string }> = [
    { id: 'registrados', titulo: 'Registrados' },
    { id: 'revisar', titulo: 'Por revisar' },
    { id: 'en-linea', titulo: 'En línea' },
    { id: 'caja', titulo: 'Cuadre de caja' },
  ];

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(q => {
      const v = q.get('vista') as Vista;
      this.abrir(this.VISTAS.some(x => x.id === v) ? v : 'registrados', false);
    });
    // El número de la pestaña «Por revisar» se ve desde cualquier vista.
    this.comprobantes.list({ status: 'pending', per_page: 1 }).subscribe({ next: (r: any) => this.totalPorRevisar = Number(r?.data?.total ?? 0), error: () => {} });
  }

  abrir(v: Vista, navegar = true): void {
    this.vista = v;
    if (navegar) this.router.navigate([], { queryParams: { vista: v === 'registrados' ? null : v }, queryParamsHandling: 'merge', replaceUrl: true });
    if (v === 'registrados' && !this.reg) this.cargarRegistrados();
    if (v === 'revisar' && !this.cola.length) this.cargarCola();
    if (v === 'en-linea' && !this.linea) this.cargarLinea();
    if (v === 'caja' && !this.caja) this.cargarCaja();
  }

  verFicha(id: number | null | undefined, nombre = ''): void {
    if (id) this.ficha.abrir({ user_id: id, nombre });
  }

  pesos(v: unknown): string {
    const n = Math.round(Number(v) || 0);
    return (n < 0 ? '− $ ' : '$ ') + Math.abs(n).toLocaleString('es-CO');
  }

  // ── Registrados ──────────────────────────────────────────────────────────
  reg: any = null;
  cargandoReg = false;
  filtros = { q: '', desde: '', hasta: '', medio: '', quien: '', tipo: '', page: 1 };
  pagoSel: any = null;
  private buscarTimer: any;
  readonly TIPOS: Record<string, string> = { pago_completo: 'Pago', abono: 'Abono', reverso: 'Reversado' };

  cargarRegistrados(): void {
    this.cargandoReg = true;
    this.pagos.registrados(this.filtros).subscribe({
      next: (r: any) => {
        this.cargandoReg = false;
        this.reg = r?.data ?? null;
        if (!this.filtros.desde && this.reg) { this.filtros.desde = this.reg.desde; this.filtros.hasta = this.reg.hasta; }
        this.pagoSel = this.reg?.items?.[0] ?? null;
      },
      error: () => { this.cargandoReg = false; this.toast.error('No se pudieron cargar los pagos'); },
    });
  }

  filtrar(): void { this.filtros.page = 1; this.cargarRegistrados(); }
  buscar(): void { clearTimeout(this.buscarTimer); this.buscarTimer = setTimeout(() => this.filtrar(), 350); }
  pagina(d: number): void {
    const ultima = Math.max(1, Math.ceil((this.reg?.total ?? 0) / (this.reg?.por_pagina ?? 25)));
    const p = Math.min(ultima, Math.max(1, this.filtros.page + d));
    if (p !== this.filtros.page) { this.filtros.page = p; this.cargarRegistrados(); }
  }

  /** Los tres medios que más recaudaron y el resto junto, para la franja de totales. */
  get mediosTop(): any[] {
    const m: any[] = this.reg?.por_medio ?? [];
    if (m.length <= 4) return m;
    const resto = m.slice(3);
    return [...m.slice(0, 3), { nombre: `Otros ${resto.length} medios`, pagos: resto.reduce((a, x) => a + x.pagos, 0), total: resto.reduce((a, x) => a + x.total, 0) }];
  }

  async revertir(p: any): Promise<void> {
    if (!p?.det_facturation_id || p.type === 'reverso') return;
    const ok = await this.dialog.confirm(`La factura ${p.number_facture} de ${p.client_name} vuelve a quedar pendiente. El pago no se borra: queda anotado como reverso.`,
      { title: 'Revertir el pago', okLabel: 'Revertir', danger: true });
    if (!ok) return;
    const motivo = (window.prompt('¿Por qué se revierte? Queda en el historial.') ?? '').trim();
    if (!motivo) { this.toast.error('Sin motivo no se revierte'); return; }
    this.finanzas.revertirPago(p.det_facturation_id, motivo).subscribe({
      next: (r: any) => { this.toast.success(r?.message || 'Pago revertido'); this.cargarRegistrados(); },
      error: (e: any) => this.toast.error(e?.error?.message || 'No se pudo revertir'),
    });
  }

  // ── Por revisar ──────────────────────────────────────────────────────────
  cola: any[] = [];
  totalPorRevisar = 0;
  cargandoCola = false;
  sel: any = null;
  montoAprobar = '';
  trabajando = false;
  rechazando = false;
  tipoRechazo = 'no_coincide';
  readonly TIPOS_RECHAZO = [
    { id: 'no_coincide', label: 'No coincide con la factura' },
    { id: 'viejo', label: 'Viejo o ya usado' },
    { id: 'otra_cuenta', label: 'No fue a una cuenta de la empresa' },
    { id: 'falso', label: 'Falso o editado' },
    { id: 'otro', label: 'Otro motivo' },
  ];
  asignando = false;
  buscarCliente = '';
  clientesEncontrados: any[] = [];
  private buscarClienteTimer: any;

  cargarCola(): void {
    this.cargandoCola = true;
    this.comprobantes.list({ status: 'pending', per_page: 40 }).subscribe({
      next: (r: any) => {
        this.cargandoCola = false;
        this.cola = r?.data?.data ?? [];
        this.totalPorRevisar = Number(r?.data?.total ?? this.cola.length);
        this.elegir(this.cola[0] ?? null);
      },
      error: () => { this.cargandoCola = false; this.toast.error('No se pudieron cargar los comprobantes'); },
    });
  }

  elegir(c: any): void {
    this.sel = c;
    this.rechazando = false;
    this.asignando = false;
    this.clientesEncontrados = [];
    const monto = c?.reported_amount ?? c?.detected_amount;
    this.montoAprobar = monto ? String(Math.round(Number(monto))) : '';
  }

  montoDe(c: any): number | null {
    const m = c?.reported_amount ?? c?.detected_amount;
    return m !== null && m !== undefined ? Number(m) : null;
  }

  nombreDe(c: any): string {
    const u = c?.user;
    return u ? `${u.names ?? ''} ${u.lastname ?? ''}`.trim() : 'Sin cliente reconocido';
  }

  /** Lo que dice el semáforo del comprobante, en una frase para la lista. */
  estadoDe(c: any): { texto: string; tono: 'ok' | 'warn' | 'mal' } {
    if (!c?.user_id) return { texto: 'Sin cliente', tono: 'warn' };
    if (!c?.invoice_id) return { texto: 'Sin factura pendiente', tono: 'warn' };
    const color = c?.semaforo?.color;
    const motivo = c?.semaforo?.senales?.[0]?.texto;
    if (color === 'rojo') return { texto: motivo || 'Revisar con cuidado', tono: 'mal' };
    if (color === 'amarillo') return { texto: motivo || 'Revisar el monto', tono: 'warn' };
    const fac = Number(c?.invoice?.price_total ?? 0) - Number(c?.invoice?.price_discount ?? 0) - Number(c?.invoice?.price_abone ?? 0);
    const m = this.montoDe(c);
    if (m !== null && fac > 0 && Math.round(m) === Math.round(fac)) return { texto: 'Coincide con la factura', tono: 'ok' };
    if (m !== null && fac > 0 && m < fac) return { texto: 'Paga menos: queda abono', tono: 'warn' };
    return { texto: color === 'verde' ? 'Se ve bien' : 'Por revisar', tono: color === 'verde' ? 'ok' : 'warn' };
  }

  esImagen(url: string): boolean { return /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url || ''); }

  private siguiente(): void {
    const i = this.cola.findIndex(x => x.id === this.sel?.id);
    this.cola = this.cola.filter(x => x.id !== this.sel?.id);
    this.totalPorRevisar = Math.max(0, this.totalPorRevisar - 1);
    this.elegir(this.cola[Math.min(i, this.cola.length - 1)] ?? null);
    if (!this.cola.length) this.cargarCola();
  }

  aprobar(): void {
    const c = this.sel;
    const monto = Number(String(this.montoAprobar).replace(/\D/g, '')) || 0;
    if (!c || this.trabajando) return;
    if (!monto) { this.toast.error('Escriba el valor del pago'); return; }
    this.trabajando = true;
    this.comprobantes.approve(c.id, { reason: 'Aprobado desde Pagos › Por revisar.', amount: monto }).subscribe({
      next: () => { this.trabajando = false; this.toast.success(`Aprobado y aplicado: ${this.pesos(monto)}`); this.reg = null; this.siguiente(); },
      error: (e: any) => { this.trabajando = false; this.toast.error(e?.error?.message || 'No se pudo aprobar'); },
    });
  }

  rechazar(): void {
    const c = this.sel;
    if (!c || this.trabajando) return;
    this.trabajando = true;
    this.comprobantes.reject(c.id, { tipo: this.tipoRechazo }).subscribe({
      next: () => { this.trabajando = false; this.toast.success('Comprobante rechazado'); this.siguiente(); },
      error: (e: any) => { this.trabajando = false; this.toast.error(e?.error?.message || 'No se pudo rechazar'); },
    });
  }

  releer(): void {
    const c = this.sel;
    if (!c || this.trabajando) return;
    this.trabajando = true;
    this.comprobantes.releer(c.id).subscribe({
      next: () => this.comprobantes.get(c.id).subscribe({
        next: (r: any) => { this.trabajando = false; const nuevo = r?.data; if (nuevo) { Object.assign(c, nuevo); this.elegir(c); } this.toast.success('Imagen leída de nuevo'); },
        error: () => { this.trabajando = false; },
      }),
      error: (e: any) => { this.trabajando = false; this.toast.error(e?.error?.message || 'No se pudo leer la imagen'); },
    });
  }

  buscarClientes(): void {
    clearTimeout(this.buscarClienteTimer);
    const q = this.buscarCliente.trim();
    if (q.length < 3) { this.clientesEncontrados = []; return; }
    this.buscarClienteTimer = setTimeout(() => this.comprobantes.buscarClientes(q).subscribe({
      next: (r: any) => this.clientesEncontrados = (Array.isArray(r?.data) ? r.data : []).slice(0, 6),
      error: () => this.clientesEncontrados = [],
    }), 300);
  }

  async asignar(cliente: any): Promise<void> {
    const c = this.sel;
    if (!c) return;
    if (!await this.dialog.confirm(`¿El comprobante es de ${cliente.names} ${cliente.lastname} (${cliente.dni})?`, { okLabel: 'Sí, es de este cliente' })) return;
    this.comprobantes.asignar(c.id, cliente.id).subscribe({
      next: (r: any) => {
        this.toast.success('Cliente asignado: revise la factura y apruebe');
        this.comprobantes.get(c.id).subscribe({ next: (x: any) => { Object.assign(c, x?.data ?? {}); this.elegir(c); } });
      },
      error: (e: any) => this.toast.error(e?.error?.message || 'No se pudo asignar'),
    });
  }

  /** Teclado en «Por revisar»: A aprueba, R abre el rechazo, flechas o J/K cambian de comprobante. */
  @HostListener('document:keydown', ['$event'])
  teclas(ev: KeyboardEvent): void {
    if (this.vista !== 'revisar' || !this.sel) return;
    const t = ev.target as HTMLElement;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const i = this.cola.findIndex(x => x.id === this.sel?.id);
    const k = ev.key.toLowerCase();
    if (k === 'a') { ev.preventDefault(); this.aprobar(); }
    else if (k === 'r') { ev.preventDefault(); this.rechazando = true; }
    else if (k === 'arrowdown' || k === 'j') { ev.preventDefault(); if (i < this.cola.length - 1) this.elegir(this.cola[i + 1]); }
    else if (k === 'arrowup' || k === 'k') { ev.preventDefault(); if (i > 0) this.elegir(this.cola[i - 1]); }
  }

  // ── En línea ─────────────────────────────────────────────────────────────
  linea: any = null;
  cargandoLinea = false;
  escribiendo = new Set<number>();
  readonly ESTADOS_ENLACE: Record<string, string> = { usado: 'Usado', vencido: 'Vencido', sin_usar: 'Sin usar' };

  cargarLinea(): void {
    this.cargandoLinea = true;
    this.pagos.enLinea().subscribe({
      next: (r: any) => { this.cargandoLinea = false; this.linea = r?.data ?? null; },
      error: () => { this.cargandoLinea = false; this.toast.error('No se pudieron cargar los pagos en línea'); },
    });
  }

  totalPasarela(g: any): number { return (g.pagados || 0) + (g.pendientes || 0) + (g.fallidos || 0); }

  escribirle(t: any): void {
    this.escribiendo.add(t.id);
    this.pagos.escribirle(t.id).subscribe({
      next: (r: any) => { this.escribiendo.delete(t.id); r?.status === 0 ? this.toast.success(r.message) : this.toast.error(r?.message || 'No se pudo enviar'); if (r?.status === 0) t.escrito = true; },
      error: (e: any) => { this.escribiendo.delete(t.id); this.toast.error(e?.error?.message || 'No se pudo enviar'); },
    });
  }

  // ── Cuadre de caja ───────────────────────────────────────────────────────
  caja: any = null;
  cargandoCaja = false;
  fechaCaja = this.hoy();
  contado: Record<string, string> = {};
  notaCaja = '';
  cerrando = false;

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  get esHoy(): boolean { return this.fechaCaja === this.hoy(); }

  moverDia(d: number): void {
    const f = new Date(this.fechaCaja + 'T12:00:00');
    f.setDate(f.getDate() + d);
    const nueva = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
    if (nueva > this.hoy()) return;
    this.fechaCaja = nueva;
    this.cargarCaja();
  }

  claveMedio(m: any): string { return String(m?.id ?? 'sin'); }

  cargarCaja(): void {
    this.cargandoCaja = true;
    this.pagos.caja(this.fechaCaja).subscribe({
      next: (r: any) => {
        this.cargandoCaja = false;
        this.caja = r?.data ?? null;
        // Si ya se cerró, se muestra lo que se escribió; si no, en blanco.
        const prev: any[] = this.caja?.cierre?.detalle ?? [];
        this.contado = {};
        (this.caja?.por_medio ?? []).forEach((m: any) => {
          const p = prev.find(x => String(x.id ?? 'sin') === this.claveMedio(m));
          this.contado[this.claveMedio(m)] = p && p.contado !== null && p.contado !== undefined ? String(Math.round(p.contado)) : '';
        });
        this.notaCaja = this.caja?.cierre?.nota ?? '';
      },
      error: () => { this.cargandoCaja = false; this.toast.error('No se pudo cargar la caja'); },
    });
  }

  valorContado(m: any): number | null {
    const v = this.contado[this.claveMedio(m)];
    return v === undefined || v === '' ? null : Number(String(v).replace(/\D/g, '')) || 0;
  }

  diferencia(m: any): number | null {
    const v = this.valorContado(m);
    return v === null ? null : v - Number(m.total || 0);
  }

  get totalContado(): number | null {
    const medios: any[] = this.caja?.por_medio ?? [];
    if (!medios.length || medios.some(m => this.valorContado(m) === null)) return null;
    return medios.reduce((a, m) => a + (this.valorContado(m) || 0), 0);
  }

  get diferenciaTotal(): number | null {
    const t = this.totalContado;
    return t === null ? null : t - Number(this.caja?.total || 0);
  }

  cerrarCaja(): void {
    if (!this.caja || this.cerrando) return;
    const medios: any[] = this.caja.por_medio ?? [];
    if (medios.some(m => this.valorContado(m) === null)) { this.toast.error('Escriba lo que hay en cada medio'); return; }
    if (Math.abs(this.diferenciaTotal ?? 0) >= 1 && !this.notaCaja.trim()) { this.toast.error('No cuadra: escriba en la nota por qué'); return; }
    this.cerrando = true;
    this.pagos.cerrarCaja(this.fechaCaja, medios.map(m => ({ medio_id: m.id ?? null, valor: this.valorContado(m) || 0 })), this.notaCaja.trim()).subscribe({
      next: (r: any) => { this.cerrando = false; r?.status === 0 ? this.toast.success(r.message) : this.toast.error(r?.message); this.cargarCaja(); },
      error: (e: any) => { this.cerrando = false; this.toast.error(e?.error?.message || 'No se pudo cerrar la caja'); },
    });
  }
}
