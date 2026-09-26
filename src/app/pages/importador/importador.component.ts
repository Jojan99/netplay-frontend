import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription, switchMap, timer } from 'rxjs';
import { ImportadorService, OpcionesImportacion, OrigenImportacion } from '../../services/importador.service';
import { AuthService } from '../../services/auth.service';
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
  /** Aviso si falta correr la migración de la segunda tanda. */
  faltaMigracion = '';
  /** Qué tiene prendido la empresa: recordatorios, correo y corte automático. */
  avisosEmpresa: any = null;

  // Paso 1
  origen: OrigenImportacion | null = null;
  metodo: 'api' | 'archivo' = 'api';
  api = { url: '', token: '', guardar: false, usarGuardado: false };
  archivo: File | null = null;

  // La importación en curso
  imp: any = null;
  muestra: string[][] = [];
  mapeo: Record<string, number | null> = {};
  /** Lo que el sistema detecta solo: para volver atrás si se cambió a mano. */
  mapeoSugerido: Record<string, number | null> = {};
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

  // Nombres
  ejemplosNombre: { completo: string; nombres: string; apellidos: string }[] = [];
  probandoNombres = false;

  // Grupos de facturación
  nuevoGrupo = { billing_day: 15, nombre: '' };
  creandoGrupo = false;

  // Selección de clientes en la lista, para asignarles grupo o router
  seleccion = new Set<number>();
  asignando = false;
  asignarGrupo: number | null = null;
  asignarRouter: number | null = null;

  // Cotejo con el MikroTik (después de importar)
  cotejando = false;
  cotejo: any = null;
  routerCotejo: number | null = null;

  // Normalizar los comentarios del router (opcional)
  comentarios: any = null;
  revisandoComentarios = false;
  confirmarComentarios = false;

  private sondeo?: Subscription;

  // ── Presentación de los selects ──────────────────────────────────────
  readonly pres: PresentacionSelect<Opcion> = { etiqueta: o => o.t, detalle: o => o.d, valor: o => o.v, clave: o => o.v };

  opcionesPlan: Opcion[] = [];
  opcionesRouter: Opcion[] = [];
  opcionesGrupo: Opcion[] = [];
  opcionesColumna: Opcion[] = [];
  readonly ESTADOS: { v: string; t: string; ayuda: string }[] = [
    { v: 'activo', t: 'Activos', ayuda: 'Entran con el servicio andando.' },
    { v: 'suspendido', t: 'Suspendidos', ayuda: 'Entran suspendidos también aquí.' },
    { v: 'retirado', t: 'Retirados', ayuda: 'Entran dados de baja, sólo como historial.' },
  ];

  readonly MODOS_GRUPO: { v: string; t: string }[] = [
    { v: 'todos', t: 'A todos el mismo' },
    { v: 'plan', t: 'Según el plan' },
    { v: 'router', t: 'Según el router o zona' },
    { v: 'estado', t: 'Según el estado' },
  ];

  opcionesRegla: Opcion[] = [];

  readonly opcionesFechaSaldo: Opcion[] = [
    { v: 'corte', t: 'El día de corte de su grupo (este mes)', d: 'Es lo más parecido a una factura normal' },
    { v: 'hoy', t: 'Hoy' },
    { v: 'fecha', t: 'Una fecha que yo elija', d: 'Una fecha pasada ya cuenta como atrasada' },
  ];

  /** Las filas de la tabla de reparto de grupos, según el modo elegido. */
  repartoVista: { clave: string; nombre: string; clientes: number }[] = [];

  // trackBy: sin esto Angular rehace los selectores en cada ciclo y la pestaña
  // se pone lenta con archivos grandes.
  porValor = (_: number, x: { v: string }) => x.v;
  porClave = (_: number, x: { clave: string }) => x.clave;
  porGrupo = (_: number, x: { grupo: number }) => x.grupo;
  porPlan = (_: number, x: { plan: string }) => x.plan;
  porCompleto = (_: number, x: { completo: string }) => x.completo;
  porFila = (_: number, f: { id: number }) => f.id;

  /** El valor mensual que hoy tiene un plan de la empresa. */
  valorDelPlan(id: any): number | null {
    const p = this.planes.find(x => x.id === Number(id));
    return p ? (Number(p.monthly_price) || null) : null;
  }

  grupoDeReparto(clave: string): number | null {
    const o = this.opciones;
    const mapa = o.grupo_modo === 'plan' ? o.grupos_por_plan : (o.grupo_modo === 'router' ? o.grupos_por_router : o.grupos_por_estado);
    return mapa[clave] ?? null;
  }

  ponerGrupoReparto(clave: string, grupo: number | null): void {
    const o = this.opciones;
    const mapa = o.grupo_modo === 'plan' ? o.grupos_por_plan : (o.grupo_modo === 'router' ? o.grupos_por_router : o.grupos_por_estado);
    mapa[clave] = grupo;
    this.recalcularResumen();
  }

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
        this.camposLista = Object.entries(this.campos).map(([campo, etiqueta]) => ({ campo, etiqueta }));
        this.planes = d.planes ?? [];
        this.routers = d.routers ?? [];
        this.grupos = d.grupos ?? [];
        this.credenciales = d.credenciales ?? [];
        this.historial = d.importaciones ?? [];
        this.faltaMigracion = d.falta_migracion ?? '';
        this.avisosEmpresa = d.avisos_empresa ?? null;
        this.opcionesRegla = Object.entries(d.reglas_nombre ?? {}).map(([v, t]) => ({ v, t: String(t) }));
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
  /**
   * Los campos a mapear, armados una sola vez. Como getter devolvía un arreglo
   * nuevo en cada ciclo de Angular, el *ngFor rehacía los selectores sin parar y
   * la pestaña se colgaba al subir un archivo.
   */
  camposLista: { campo: string; etiqueta: string }[] = [];

  porCampo = (_: number, c: { campo: string }) => c.campo;

  /**
   * Dos datos distintos no pueden salir de la misma columna: los apellidos no
   * son la columna del nombre ni el precio la del plan (leía "80 Mb" como $80).
   */
  private limpiarMapeo(mapeo: Record<string, number | null>): Record<string, number | null> {
    const m = { ...mapeo };
    if (m['apellidos'] !== null && m['apellidos'] === m['nombre']) m['apellidos'] = null;
    if (m['plan_precio'] !== null && m['plan_precio'] === m['plan']) m['plan_precio'] = null;
    return m;
  }

  volverADetectar(): void {
    this.mapeo = this.limpiarMapeo(this.mapeoSugerido);
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
    if (imp.mapeo_sugerido) this.mapeoSugerido = imp.mapeo_sugerido;

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
        this.mapeo = this.limpiarMapeo(imp.mapeo ?? {});
        this.opcionesColumna = (imp.columnas ?? []).map((c: string, i: number) => ({
          v: i, t: c || `Columna ${i + 1}`, d: this.muestra.map(f => f[i]).filter(v => v).slice(0, 2).join(' · ') || null,
        }));
        break;
      case 'analizado':
        this.paso = 'previa';
        // Las columnas quedan a mano por si hay que corregir el mapeo.
        this.mapeo = this.limpiarMapeo(imp.mapeo ?? {});
        this.opcionesColumna = (imp.columnas ?? []).map((c: string, i: number) => ({
          v: i, t: c || `Columna ${i + 1}`, d: this.muestra.map(f => f[i]).filter(v => v).slice(0, 2).join(' · ') || null,
        }));
        this.resumirAnalisis();
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
    this.seleccion.clear();
    this.cotejo = null;
    this.comentarios = null;
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
      planes: {}, precios: {}, actualizar_precio: {},
      routers: {}, router_todos: null,
      estados: ['activo', 'suspendido'], existentes: 'omitir',
      grupo: null, grupo_modo: 'todos', grupos_por_plan: {}, grupos_por_router: {}, grupos_por_estado: {},
      grupo_por_dia: false, cobro_mes_completo: true, tipo_plan: 'fibra', regla_nombre: 'auto',
      saldo: { crear: false, concepto: '', fecha_modo: 'corte', fecha: null, evitar_envio: true },
    };
  }

  private armarOpciones(): void {
    const peso = (n: number) => new Intl.NumberFormat('es-CO').format(Number(n) || 0);
    this.opcionesPlan = [
      { v: 'crear', t: 'Crear este plan', d: 'Con el nombre, la velocidad y el precio del origen' },
      ...this.planes.map(p => ({ v: p.id, t: p.plan_name, d: `${p.download_speed}/${p.upload_speed} Mbps · $${peso(p.monthly_price)}${p.active ? '' : ' · inactivo'}` })),
    ];
    this.opcionesRouter = this.routers.map(r => ({ v: r.id, t: r.name }));
    this.opcionesGrupo = this.grupos.map(g => ({
      v: g.grupo,
      t: g.nombre ? `${g.nombre} (grupo ${g.grupo})` : `Grupo ${g.grupo}`,
      d: `Se le cobra el día ${g.billing_day}${g.clientes ? ' · ' + g.clientes + ' clientes' : ''}`,
    }));
  }

  private prepararOpciones(): void {
    const o = this.opcionesVacias();
    for (const p of this.a.planes ?? []) {
      o.planes[p.clave] = p.sugerencia ?? (p.clave === '' ? null : 'crear');
    }
    for (const r of this.a.routers ?? []) {
      o.routers[r.clave] = r.sugerencia ?? null;
    }
    for (const p of this.a.planes ?? []) {
      // El precio del origen sólo se propone cuando es creíble; si no, queda
      // vacío y la pantalla lo marca en rojo.
      o.precios[p.clave] = p.precio ?? null;
      o.actualizar_precio[p.clave] = false;
    }
    o.grupo = this.grupos.length ? this.grupos[0].grupo : null;
    o.grupo_por_dia = Object.keys(this.a.dias_pago ?? {}).length > 0;
    o.router_todos = this.routers.length === 1 ? this.routers[0].id : null;
    o.regla_nombre = this.imp?.opciones?.regla_nombre ?? 'auto';
    o.saldo.concepto = `Saldo anterior de ${this.nombre(this.origen)}`;
    if ((this.a.por_estado?.retirado ?? 0) === 0) o.estados = ['activo', 'suspendido'];
    this.opciones = o;
    this.recalcularResumen();
    this.verNombres(o.regla_nombre);
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

  // Se arman cuando llega el análisis y no en cada ciclo de Angular: un arreglo
  // nuevo por ciclo rehace la lista entera todo el tiempo.
  diasPago: { dia: string; n: number; grupo: any }[] = [];
  erroresAgrupados: { texto: string; n: number }[] = [];

  private resumirAnalisis(): void {
    this.diasPago = Object.entries(this.a.dias_pago ?? {}).map(([dia, n]) => ({
      dia, n: n as number, grupo: this.grupos.find(g => Number(g.billing_day) === Number(dia))?.grupo ?? null,
    }));
    this.erroresAgrupados = Object.entries(this.a.errores ?? {}).map(([texto, n]) => ({ texto, n: n as number }));
  }

  get puedeImportar(): boolean {
    return !!this.opciones.grupo && this.opciones.estados.length > 0 && this.planesSinElegir === 0 && this.aImportar > 0;
  }

  /** Planes que se van a usar sin valor mensual cargado: no se les puede facturar. */
  get planesSinValor(): number {
    return this.resumen.filter(r => !r.valor).length;
  }

  /**
   * Cómo queda cada grupo de clientes con lo elegido: plan, valor, día de
   * cobro y router. Es el resumen que mira el dueño antes de confirmar.
   */
  resumen: { plan: string; clientes: number; valor: number | null; nuevo: boolean; grupo: number | null; dia: number | null; router: string }[] = [];

  recalcularResumen(): void {
    const o = this.opciones;

    this.repartoVista = o.grupo_modo === 'plan'
      ? (this.a.planes ?? []).map((p: any) => ({ clave: p.clave, nombre: p.nombre, clientes: p.clientes }))
      : o.grupo_modo === 'router'
        ? (this.a.routers ?? []).map((r: any) => ({ clave: r.clave, nombre: r.nombre, clientes: r.clientes }))
        : o.grupo_modo === 'estado'
          ? this.ESTADOS.filter(e => o.estados.includes(e.v)).map(e => ({ clave: e.v, nombre: e.t, clientes: this.a.por_estado?.[e.v] ?? 0 }))
          : [];

    this.resumen = (this.a.planes ?? []).map((p: any) => {
      const eleccion = o.planes[p.clave];
      const propio = eleccion !== 'crear' ? this.planes.find(x => x.id === Number(eleccion)) : null;
      const grupo = o.grupo_modo === 'plan' ? (o.grupos_por_plan[p.clave] ?? o.grupo) : o.grupo;

      return {
        plan: propio ? propio.plan_name : (p.nombre || '(sin plan)'),
        clientes: p.clientes,
        valor: propio ? Number(propio.monthly_price) || null : (Number(o.precios[p.clave]) || null),
        nuevo: eleccion === 'crear',
        grupo,
        dia: this.grupos.find(g => g.grupo === grupo)?.billing_day ?? null,
        router: o.router_todos
          ? (this.routers.find(r => r.id === o.router_todos)?.name ?? '')
          : 'según el archivo',
      };
    });
  }

  /** Los clientes con saldo, para el aviso de la factura. */
  get saldoClientes(): number { return this.a.saldo?.clientes ?? 0; }
  get saldoTotal(): number { return this.a.saldo?.total ?? 0; }

  // ── Nombres ──────────────────────────────────────────────────────────
  verNombres(regla: string): void {
    if (!this.imp) return;
    this.opciones.regla_nombre = regla;
    this.probandoNombres = true;
    this.svc.nombres(this.imp.id, regla).subscribe({
      next: (r: any) => {
        this.probandoNombres = false;
        this.ejemplosNombre = r?.data?.ejemplos ?? [];
        this.cargarFilas();
      },
      error: () => { this.probandoNombres = false; },
    });
  }

  // ── Grupos de facturación ────────────────────────────────────────────
  crearGrupo(): void {
    if (!this.nuevoGrupo.billing_day) return;
    this.creandoGrupo = true;
    this.error = '';
    this.svc.crearGrupo({ billing_day: Number(this.nuevoGrupo.billing_day), nombre: this.nuevoGrupo.nombre.trim() }).subscribe({
      next: (r: any) => {
        this.creandoGrupo = false;
        if (r?.error) { this.error = r.message; return; }
        this.grupos = r.data?.grupos ?? this.grupos;
        this.armarOpciones();
        if (!this.opciones.grupo) this.opciones.grupo = this.grupos[0]?.grupo ?? null;
        this.nuevoGrupo = { billing_day: 30, nombre: '' };
        this.recalcularResumen();
      },
      error: (e) => { this.creandoGrupo = false; this.error = this.mensaje(e, 'No se pudo crear el grupo.'); },
    });
  }

  /** Volver al paso de columnas sin tener que subir el archivo otra vez. */
  get puedeRevisarColumnas(): boolean {
    return this.metodo === 'archivo' && this.opcionesColumna.length > 0 && this.muestra.length > 0;
  }

  nombreRouter(id: number | null): string {
    return this.routers.find(r => r.id === Number(id))?.name ?? '';
  }

  textoGrupo(g: number | null): string {
    const x = this.grupos.find(y => y.grupo === g);
    return x ? `${x.nombre || 'Grupo ' + x.grupo} · día ${x.billing_day}` : 'sin grupo';
  }

  // ── Selección de clientes ────────────────────────────────────────────
  alternarSeleccion(id: number): void {
    this.seleccion.has(id) ? this.seleccion.delete(id) : this.seleccion.add(id);
  }

  seleccionarPagina(): void {
    const todos = this.filas.every(f => this.seleccion.has(f.id));
    for (const f of this.filas) todos ? this.seleccion.delete(f.id) : this.seleccion.add(f.id);
  }

  get seleccionEnPagina(): boolean {
    return this.filas.length > 0 && this.filas.every(f => this.seleccion.has(f.id));
  }

  /** Asigna grupo o router a los clientes marcados (o a todo el filtro). */
  asignar(aTodas = false): void {
    if (!this.imp) return;
    if (!aTodas && !this.seleccion.size) return;

    const datos: any = aTodas
      ? { todas: true, filtro: this.filtro, buscar: this.buscar.trim() }
      : { ids: [...this.seleccion] };

    if (this.asignarGrupo) datos.grupo = this.asignarGrupo;
    if (this.asignarRouter) datos.router = this.asignarRouter;
    if (!datos.grupo && !datos.router) return;

    this.asignando = true;
    this.svc.asignar(this.imp.id, datos).subscribe({
      next: (r: any) => {
        this.asignando = false;
        if (r?.error) { this.error = r.message; return; }
        this.seleccion.clear();
        this.asignarGrupo = null;
        this.asignarRouter = null;
        this.cargarFilas();
      },
      error: (e) => { this.asignando = false; this.error = this.mensaje(e, 'No se pudo asignar.'); },
    });
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

  /**
   * Compara los clientes importados con el MikroTik: sólo lee el router. Con
   * amarrar=true además les anota en la ficha el router donde aparecieron.
   */
  compararConElRouter(amarrar = false): void {
    if (!this.imp) return;
    this.cotejando = true;
    this.error = '';
    this.svc.cotejo(this.imp.id, this.routerCotejo, amarrar).subscribe({
      next: (r: any) => {
        this.cotejando = false;
        this.cotejo = r?.data ?? null;
        if (r?.error) this.error = r.message;
      },
      error: (e) => { this.cotejando = false; this.error = this.mensaje(e, 'No se pudo leer el router.'); },
    });
  }

  /**
   * Los comentarios del ARP con la cédula del cliente. Primero muestra qué
   * cambiaría; sólo escribe cuando el administrador lo confirma.
   */
  verComentarios(aplicar = false): void {
    this.revisandoComentarios = true;
    this.error = '';
    this.svc.comentariosDelRouter(this.routerCotejo, aplicar).subscribe({
      next: (r: any) => {
        this.revisandoComentarios = false;
        this.confirmarComentarios = false;
        this.comentarios = r?.data ?? null;
        if (r?.error) this.error = r.message;
      },
      error: (e) => {
        this.revisandoComentarios = false;
        this.confirmarComentarios = false;
        this.error = this.mensaje(e, 'No se pudo leer el router.');
      },
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
