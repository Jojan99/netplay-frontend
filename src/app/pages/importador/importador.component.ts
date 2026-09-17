import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, switchMap, timer } from 'rxjs';
import { ImportadorService, OpcionesImportacion, OrigenImportacion } from '../../services/importador.service';
import { AuthService } from '../../services/auth.service';
import { MikrotikService } from '../../services/mikrotik.service';
import { TareasEnSegundoPlanoService } from '../../services/tareas-en-segundo-plano.service';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';

type Paso = 'origen' | 'metodo' | 'columnas' | 'leyendo' | 'previa' | 'importando' | 'resultado';

interface Opcion { v: any; t: string; d?: string | null; }

const EN_CURSO = ['leyendo', 'en_cola', 'importando', 'cancelando'];

const NOMBRE_ORIGEN: Record<OrigenImportacion, string> = { wisphub: 'WispHub', mikrowisp: 'Mikrowisp' };

/**
 * Importar clientes desde WispHub o Mikrowisp.
 *
 * Origen → cómo traer los datos (API o archivo) → columnas (sólo archivo) →
 * vista previa con planes, routers y facturación → importación en segundo
 * plano → resultado. Nada de esto toca el router ni les avisa a los clientes.
 */
@Component({
  selector: 'app-importador',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, NpSelectComponent],
  templateUrl: './importador.component.html',
  styleUrl: './importador.component.scss',
  host: { class: 'np-console' },
})
export class ImportadorComponent implements OnInit, OnDestroy {
  private svc = inject(ImportadorService);
  private auth = inject(AuthService);
  private mikrotik = inject(MikrotikService);
  private tareas = inject(TareasEnSegundoPlanoService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly esAdmin = this.auth.isAdmin();
  nombre(o: string | null | undefined): string {
    return (NOMBRE_ORIGEN as Record<string, string>)[o ?? ''] ?? (o ?? '');
  }

  paso: Paso = 'origen';
  cargando = true;
  ocupado = false;
  error = '';

  // Lo de la empresa
  campos: Record<string, string> = {};
  planes: any[] = [];
  routers: any[] = [];
  grupos: any[] = [];
  credenciales: any[] = [];
  historial: any[] = [];

  // Paso 1
  origen: OrigenImportacion | null = null;
  metodo: 'api' | 'archivo' = 'api';
  api = { url: '', token: '', guardar: false, usarGuardado: false };
  archivo: File | null = null;

  // La importación en curso
  imp: any = null;
  muestra: string[][] = [];
  mapeo: Record<string, number | null> = {};
  opciones: OpcionesImportacion = this.opcionesVacias();

  // Filas
  filtro = '';
  buscar = '';
  pagina = 1;
  totalFilas = 0;
  porPagina = 50;
  filas: any[] = [];
  cargandoFilas = false;
  filaAbierta: number | null = null;
  private buscarTimer: any;

  confirmar = false;
  sincronizando = false;
  sincronizacion: any = null;

  private sondeo?: Subscription;

  // ── Presentación de los selects ──────────────────────────────────────
  readonly pres: PresentacionSelect<Opcion> = { etiqueta: o => o.t, detalle: o => o.d, valor: o => o.v, clave: o => o.v };

  opcionesPlan: Opcion[] = [];
  opcionesRouter: Opcion[] = [];
  opcionesGrupo: Opcion[] = [];
  opcionesColumna: Opcion[] = [];
  readonly opcionesTipoPlan: Opcion[] = [
    { v: 'fibra', t: 'Fibra óptica' }, { v: 'wireless', t: 'Wireless / Radio' },
    { v: 'cable', t: 'Cable coaxial' }, { v: 'dsl', t: 'DSL / ADSL' }, { v: 'otro', t: 'Otro' },
  ];

  ngOnInit(): void {
    if (!this.esAdmin) {
      this.cargando = false;
      return;
    }

    this.svc.inicio().subscribe({
      next: (r: any) => {
        const d = r?.data ?? {};
        this.campos = d.campos ?? {};
        this.planes = d.planes ?? [];
        this.routers = d.routers ?? [];
        this.grupos = d.grupos ?? [];
        this.credenciales = d.credenciales ?? [];
        this.historial = d.importaciones ?? [];
        this.armarOpciones();
        this.cargando = false;

        const id = Number(this.route.snapshot.queryParamMap.get('id'));
        if (id) this.abrir(id);
      },
      error: (e) => { this.cargando = false; this.error = this.mensaje(e, 'No se pudo abrir el importador.'); },
    });
  }

  ngOnDestroy(): void {
    this.sondeo?.unsubscribe();
    clearTimeout(this.buscarTimer);
  }

  // ── Paso 1: origen y método ──────────────────────────────────────────
  elegirOrigen(o: OrigenImportacion): void {
    this.origen = o;
    this.error = '';
    const guardada = this.credencial(o);
    this.api = {
      url: guardada?.api_url ?? (o === 'wisphub' ? 'https://api.wisphub.net' : ''),
      token: '',
      guardar: false,
      usarGuardado: !!guardada,
    };
    this.archivo = null;
    this.paso = 'metodo';
  }

  credencial(o: OrigenImportacion | null): any {
    return this.credenciales.find(c => c.origen === o) ?? null;
  }

  olvidarCredencial(): void {
    if (!this.origen) return;
    this.svc.olvidarCredencial(this.origen).subscribe({
      next: () => {
        this.credenciales = this.credenciales.filter(c => c.origen !== this.origen);
        this.api.usarGuardado = false;
      },
    });
  }

  elegirArchivo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
    this.error = '';
  }

  conectarApi(): void {
    if (!this.origen) return;
    this.ocupado = true;
    this.error = '';
    this.svc.desdeApi({
      origen: this.origen,
      url: this.api.url.trim(),
      token: this.api.usarGuardado ? '' : this.api.token.trim(),
      usar_guardado: this.api.usarGuardado,
      guardar: !this.api.usarGuardado && this.api.guardar,
    }).subscribe({
      next: (r: any) => {
        this.ocupado = false;
        if (r?.error) { this.error = r.message; return; }
        this.api.token = '';
        this.tomar(r.data);
        this.tareas.seguirImportacion(r.data.id, `Leyendo clientes de ${NOMBRE_ORIGEN[this.origen!]}`);
      },
      error: (e) => { this.ocupado = false; this.error = this.mensaje(e, 'No se pudo conectar.'); },
    });
  }

  subirArchivo(): void {
    if (!this.origen || !this.archivo) return;
    this.ocupado = true;
    this.error = '';
    this.svc.desdeArchivo(this.origen, this.archivo).subscribe({
      next: (r: any) => {
        this.ocupado = false;
        if (r?.error) { this.error = r.message; return; }
        this.tomar(r.data);
      },
      error: (e) => { this.ocupado = false; this.error = this.mensaje(e, 'No se pudo leer el archivo.'); },
    });
  }

  // ── Paso 2 (archivo): columnas ───────────────────────────────────────
  get camposLista(): { campo: string; etiqueta: string }[] {
    return Object.entries(this.campos).map(([campo, etiqueta]) => ({ campo, etiqueta }));
  }

  ejemploColumna(campo: string): string {
    const i = this.mapeo[campo];
    if (i === null || i === undefined) return '';
    return this.muestra.map(f => f[i]).filter(v => v).slice(0, 2).join(' · ');
  }

  get columnasListas(): boolean {
    return this.mapeo['dni'] != null && this.mapeo['nombre'] != null;
  }

  confirmarColumnas(): void {
    if (!this.imp) return;
    this.ocupado = true;
    this.error = '';
    this.svc.mapeo(this.imp.id, this.mapeo).subscribe({
      next: (r: any) => {
        this.ocupado = false;
        if (r?.error) { this.error = r.message; return; }
        this.tomar(r.data);
      },
      error: (e) => { this.ocupado = false; this.error = this.mensaje(e, 'No se pudo armar la vista previa.'); },
    });
  }

  // ── La importación: abrir, seguir y mostrar ──────────────────────────
  abrir(id: number): void {
    this.error = '';
    this.svc.ver(id).subscribe({
      next: (r: any) => r?.error ? (this.error = r.message) : this.tomar(r.data),
      error: (e) => this.error = this.mensaje(e, 'No se encontró la importación.'),
    });
  }

  private tomar(imp: any): void {
    const anterior = this.imp?.estado;
    this.imp = imp;
    this.origen = imp.origen;
    this.metodo = imp.metodo;
    if (imp.muestra) this.muestra = imp.muestra;

    this.router.navigate([], { relativeTo: this.route, queryParams: { id: imp.id }, replaceUrl: true });

    switch (imp.estado) {
      case 'leyendo':
        this.paso = 'leyendo';
        break;
      case 'en_cola':
      case 'importando':
        this.paso = 'importando';
        break;
      case 'cancelando':
        this.paso = imp.procesadas > 0 || this.paso === 'importando' ? 'importando' : 'leyendo';
        break;
      case 'mapeo':
        this.paso = 'columnas';
        this.mapeo = { ...(imp.mapeo ?? {}) };
        this.opcionesColumna = (imp.columnas ?? []).map((c: string, i: number) => ({
          v: i, t: c || `Columna ${i + 1}`, d: this.muestra.map(f => f[i]).filter(v => v).slice(0, 2).join(' · ') || null,
        }));
        break;
      case 'analizado':
        this.paso = 'previa';
        if (anterior !== 'analizado') this.prepararOpciones();
        this.cambiarFiltro('');
        break;
      case 'listo':
        this.paso = 'resultado';
        this.opciones = { ...this.opcionesVacias(), ...(imp.opciones ?? {}) };
        this.cambiarFiltro('');
        this.recargarHistorial();
        break;
      case 'cancelada':
      case 'error':
        if (imp.procesadas > 0) {
          this.paso = 'resultado';
          // Para "continuar con los que faltan" con lo que ya se había elegido.
          this.opciones = { ...this.opcionesVacias(), ...(imp.opciones ?? {}) };
          this.cambiarFiltro('');
        } else {
          this.paso = this.origen ? 'metodo' : 'origen';
          this.error = imp.detalle || (imp.estado === 'error' ? 'La importación falló.' : 'La importación se canceló.');
        }
        this.recargarHistorial();
        break;
    }

    if (EN_CURSO.includes(imp.estado)) this.seguir(imp.id);
    else this.sondeo?.unsubscribe();
  }

  private seguir(id: number): void {
    this.sondeo?.unsubscribe();
    this.sondeo = timer(3000, 3000).pipe(switchMap(() => this.svc.ver(id))).subscribe({
      next: (r: any) => {
        if (r?.error || !r?.data) return;
        const sigue = EN_CURSO.includes(r.data.estado);
        if (sigue) {
          this.imp = r.data;
        } else {
          this.sondeo?.unsubscribe();
          this.tomar(r.data);
        }
      },
    });
  }

  cancelar(): void {
    if (!this.imp) return;
    this.svc.cancelar(this.imp.id).subscribe({
      next: (r: any) => {
        if (!r?.data) return;
        if (['mapeo', 'analizado'].includes(this.imp.estado)) {
          this.nueva();
        } else {
          this.tomar(r.data);
        }
      },
    });
  }

  nueva(): void {
    this.sondeo?.unsubscribe();
    this.imp = null;
    this.origen = null;
    this.muestra = [];
    this.filas = [];
    this.sincronizacion = null;
    this.error = '';
    this.paso = 'origen';
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    this.recargarHistorial();
  }

  private recargarHistorial(): void {
    this.svc.inicio().subscribe({
      next: (r: any) => {
        this.historial = r?.data?.importaciones ?? this.historial;
        this.planes = r?.data?.planes ?? this.planes;
        this.armarOpciones();
      },
    });
  }

  // ── Paso 3: vista previa y opciones ──────────────────────────────────
  get a(): any { return this.imp?.analisis ?? {}; }

  private opcionesVacias(): OpcionesImportacion {
    return {
      planes: {}, routers: {}, estados: ['activo', 'suspendido'], existentes: 'omitir',
      grupo: null, grupo_por_dia: false, cobro_mes_completo: true, tipo_plan: 'fibra',
    };
  }

  private armarOpciones(): void {
    const peso = (n: number) => new Intl.NumberFormat('es-CO').format(Number(n) || 0);
    this.opcionesPlan = [
      { v: 'crear', t: 'Crear este plan', d: 'Con el nombre, la velocidad y el precio del origen' },
      ...this.planes.map(p => ({ v: p.id, t: p.plan_name, d: `${p.download_speed}/${p.upload_speed} Mbps · $${peso(p.monthly_price)}${p.active ? '' : ' · inactivo'}` })),
    ];
    this.opcionesRouter = this.routers.map(r => ({ v: r.id, t: r.name }));
    this.opcionesGrupo = this.grupos.map(g => ({ v: g.grupo, t: `Grupo ${g.grupo}`, d: `Factura el día ${g.billing_day}` }));
  }

  private prepararOpciones(): void {
    const o = this.opcionesVacias();
    for (const p of this.a.planes ?? []) {
      o.planes[p.clave] = p.sugerencia ?? (p.clave === '' ? null : 'crear');
    }
    for (const r of this.a.routers ?? []) {
      o.routers[r.clave] = r.sugerencia ?? null;
    }
    o.grupo = this.grupos.length ? this.grupos[0].grupo : null;
    o.grupo_por_dia = Object.keys(this.a.dias_pago ?? {}).length > 0;
    if ((this.a.por_estado?.retirado ?? 0) === 0) o.estados = ['activo', 'suspendido'];
    this.opciones = o;
  }

  alternarEstado(e: string): void {
    const s = new Set(this.opciones.estados);
    s.has(e) ? s.delete(e) : s.add(e);
    this.opciones.estados = [...s];
  }

  get planesSinElegir(): number {
    return (this.a.planes ?? []).filter((p: any) => !this.opciones.planes[p.clave]).length;
  }

  get planesACrear(): number {
    return Object.values(this.opciones.planes).filter(v => v === 'crear').length;
  }

  /** Cuántos se van a crear o tocar con lo elegido (sin contar los inválidos). */
  get aImportar(): number {
    const est = this.a.por_estado ?? {};
    const elegidos = this.opciones.estados.reduce((n, e) => n + (est[e] ?? 0), 0) + (this.opciones.estados.includes('activo') ? (est.desconocido ?? 0) : 0);
    return Math.max(0, Math.min(elegidos, (this.a.total ?? 0) - (this.a.invalidos ?? 0)));
  }

  get diasPago(): { dia: string; n: number; grupo: any }[] {
    return Object.entries(this.a.dias_pago ?? {}).map(([dia, n]) => ({
      dia, n: n as number, grupo: this.grupos.find(g => Number(g.billing_day) === Number(dia))?.grupo ?? null,
    }));
  }

  get erroresAgrupados(): { texto: string; n: number }[] {
    return Object.entries(this.a.errores ?? {}).map(([texto, n]) => ({ texto, n: n as number }));
  }

  get puedeImportar(): boolean {
    return !!this.opciones.grupo && this.opciones.estados.length > 0 && this.planesSinElegir === 0 && this.aImportar > 0;
  }

  ejecutar(): void {
    if (!this.imp || !this.puedeImportar) return;
    this.ocupado = true;
    this.error = '';
    this.svc.ejecutar(this.imp.id, this.opciones).subscribe({
      next: (r: any) => {
        this.ocupado = false;
        this.confirmar = false;
        if (r?.error) { this.error = r.message; return; }
        this.tareas.seguirImportacion(r.data.id, `Importando clientes de ${NOMBRE_ORIGEN[this.origen!]}`);
        this.tomar(r.data);
      },
      error: (e) => { this.ocupado = false; this.confirmar = false; this.error = this.mensaje(e, 'No se pudo iniciar la importación.'); },
    });
  }

  // ── Filas ────────────────────────────────────────────────────────────
  cambiarFiltro(f: string): void {
    this.filtro = f;
    this.pagina = 1;
    this.cargarFilas();
  }

  alBuscar(): void {
    clearTimeout(this.buscarTimer);
    this.buscarTimer = setTimeout(() => { this.pagina = 1; this.cargarFilas(); }, 350);
  }

  irAPagina(p: number): void {
    if (p < 1 || p > this.paginas) return;
    this.pagina = p;
    this.cargarFilas();
  }

  get paginas(): number { return Math.max(1, Math.ceil(this.totalFilas / this.porPagina)); }

  private cargarFilas(): void {
    if (!this.imp) return;
    this.cargandoFilas = true;
    this.svc.filas(this.imp.id, this.filtro, this.buscar.trim(), this.pagina).subscribe({
      next: (r: any) => {
        this.cargandoFilas = false;
        this.filas = r?.data?.filas ?? [];
        this.totalFilas = r?.data?.total ?? 0;
        this.porPagina = r?.data?.por_pagina ?? 50;
      },
      error: () => { this.cargandoFilas = false; },
    });
  }

  tonoFila(f: any): string {
    const r = f.resultado ?? f.previo;
    return ({ creado: 'active', nuevo: 'active', actualizado: 'info', existente: 'info', omitido: 'neutral', error: 'suspended', invalido: 'suspended' } as any)[r] ?? 'neutral';
  }

  textoFila(f: any): string {
    const r = f.resultado ?? f.previo;
    return ({ creado: 'Creado', nuevo: 'Nuevo', actualizado: 'Actualizado', existente: 'Ya existe', omitido: 'Omitido', error: 'Error', invalido: 'Con errores' } as any)[r] ?? r;
  }

  textoEstado(e: string | null): string {
    return ({ activo: 'Activo', suspendido: 'Suspendido', retirado: 'Retirado' } as any)[e ?? ''] ?? 'Sin estado';
  }

  // ── Resultado ────────────────────────────────────────────────────────
  get porcentaje(): number {
    const t = this.imp?.total || 0;
    return t ? Math.min(100, Math.round((this.imp.procesadas / t) * 100)) : 0;
  }

  descargarReporte(): void {
    if (!this.imp) return;
    this.svc.reporte(this.imp.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `importacion-${this.imp.origen}-${this.imp.id}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => this.error = 'No se pudo descargar el reporte.',
    });
  }

  /** Compara las IP de los clientes con el ARP del MikroTik sin escribir nada. */
  revisarRouter(): void {
    this.sincronizando = true;
    this.sincronizacion = null;
    this.mikrotik.syncIps(true).subscribe({
      next: (r: any) => { this.sincronizando = false; this.sincronizacion = r?.data ?? { errores: [r?.message] }; },
      error: (e) => { this.sincronizando = false; this.sincronizacion = { errores: [this.mensaje(e, 'No se pudo leer el router.')] }; },
    });
  }

  // ── Varios ───────────────────────────────────────────────────────────
  textoEstadoImportacion(e: string): string {
    return ({
      leyendo: 'Leyendo', mapeo: 'Columnas sin confirmar', analizado: 'Vista previa', en_cola: 'En cola', importando: 'Importando',
      cancelando: 'Cancelando', cancelada: 'Cancelada', listo: 'Terminada', error: 'Con error',
    } as any)[e] ?? e;
  }

  tonoEstadoImportacion(e: string): string {
    return ({ listo: 'active', error: 'suspended', cancelada: 'neutral', analizado: 'info', mapeo: 'info' } as any)[e] ?? 'noip';
  }

  peso(n: any): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Number(n) || 0);
  }

  private mensaje(e: any, porDefecto: string): string {
    const err = e?.error;
    if (err?.errors) return Object.values(err.errors).flat().join(' ') as string;
    return err?.message || porDefecto;
  }
}
