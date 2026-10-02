import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DocumentoFE, EstadoFE, FacturaElectronicaService, OpcionFE, PorEmitirFE, ProveedorFE,
} from '../../services/factura-electronica.service';

type Vista = 'documentos' | 'por-emitir' | 'conexion';

/**
 * Facturación electrónica (DIAN): conectar Siigo o Alegra, elegir con qué
 * numeración e impuesto se factura, y emitir lo que ya se cobró.
 *
 * La factura de la plataforma es la cuenta de cobro; la electrónica se emite
 * cuando queda pagada. Una factura aceptada por la DIAN no se borra: se anula
 * con nota crédito.
 */
@Component({
  selector: 'app-factura-electronica',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './factura-electronica.component.html',
  styleUrl: './factura-electronica.component.scss',
})
export class FacturaElectronicaComponent implements OnInit {
  private svc = inject(FacturaElectronicaService);

  cargando = true;
  estado: EstadoFE | null = null;
  vista: Vista = 'conexion';
  aviso: { texto: string; tipo: 'ok' | 'danger' } | null = null;

  // Conexión y ajustes
  forma = {
    proveedor: 'siigo', activa: false, automatica: false, emitir_desde: '',
    credenciales: {} as Record<string, string>,
    ajustes: {
      numeracion_id: '', numeracion_nc_id: '', vendedor_id: '', forma_pago_id: '', producto_id: '', centro_costo_id: '', cuenta_id: '',
      medio_pago: 'CASH', alcance: 'marcados', iva: 'excluido', impuesto_id: '', impuesto_porcentaje: 19, estratos_excluidos: [] as number[],
      municipio: '', ciudad: '', departamento: '', enviar_correo: true, nota_credito_automatica: true,
    } as Record<string, any>,
  };
  ver: Record<string, boolean> = {};
  probando = false;
  guardando = false;
  catalogos: Record<string, OpcionFE[]> | null = null;
  cargandoCatalogos = false;

  // Documentos
  documentos: DocumentoFE[] = [];
  totalDocumentos = 0;
  pagina = 1;
  filtroEstado = '';
  buscar = '';
  cargandoDocs = false;
  ocupado: Record<number, string> = {};

  // Por emitir
  porEmitir: PorEmitirFE[] = [];
  totalPorEmitir = 0;
  marcadas = new Set<number>();
  emitiendo = false;

  readonly estratos = [1, 2, 3, 4, 5, 6];
  /** Medios de pago del catálogo de la DIAN que usa Alegra. */
  readonly mediosDePago = [
    { id: 'CASH', nombre: 'Efectivo' }, { id: 'DEBIT_TRANSFER_BANK', nombre: 'Transferencia débito bancaria' },
    { id: 'CREDIT_TRANSFER', nombre: 'Transferencia crédito' }, { id: 'BANK_DEPOSIT', nombre: 'Consignación bancaria' },
    { id: 'DEBIT_CARD', nombre: 'Tarjeta débito' }, { id: 'CREDIT_CARD', nombre: 'Tarjeta crédito' },
    { id: 'MUTUAL_AGREEMENT', nombre: 'Otro (acuerdo mutuo)' },
  ];

  get proveedor(): ProveedorFE | undefined { return this.estado?.proveedores.find(p => p.id === this.forma.proveedor); }
  /* Un campo y no un getter: armar la lista en cada ciclo recreaba los <input> con ngModel,
     que disparan otro ciclo, y el navegador se quedaba colgado. */
  campos: { clave: string; etiqueta: string; secreto: boolean; ayuda: string }[] = [];
  porClave = (_: number, c: { clave: string }) => c.clave;
  porId = (_: number, x: { id: string | number }) => x.id;

  private armarCampos(): void {
    this.campos = Object.entries(this.proveedor?.campos ?? {}).map(([clave, c]) => ({ clave, ...c }));
  }
  get conectado(): boolean { return !!this.estado?.config && this.estado.config.proveedor === this.forma.proveedor; }
  get esSiigo(): boolean { return this.forma.proveedor === 'siigo'; }
  get paginas(): number { return Math.max(1, Math.ceil(this.totalDocumentos / 25)); }
  get todasMarcadas(): boolean { return this.porEmitir.length > 0 && this.porEmitir.slice(0, 10).every(f => this.marcadas.has(f.id)); }

  ngOnInit(): void { this.cargar(true); }

  cargar(primera = false): void {
    this.svc.estado().subscribe({
      next: (r: any) => {
        this.cargando = false;
        this.estado = r?.data ?? null;
        const c = this.estado?.config;
        if (c) {
          this.forma.proveedor = c.proveedor;
          this.forma.activa = c.activa;
          this.forma.automatica = c.automatica;
          this.forma.emitir_desde = c.emitir_desde ?? '';
          this.forma.ajustes = { ...this.forma.ajustes, ...c.ajustes, estratos_excluidos: (c.ajustes?.['estratos_excluidos'] ?? []).map(Number) };
        }
        this.armarCampos();
        if (primera) {
          this.vista = c?.activa ? 'documentos' : 'conexion';
          if (c?.activa) { this.cargarDocumentos(); }
        }
      },
      error: () => { this.cargando = false; this.aviso = { texto: 'No se pudo cargar la facturación electrónica.', tipo: 'danger' }; },
    });
  }

  ir(v: Vista): void {
    this.vista = v;
    this.aviso = null;
    if (v === 'documentos') this.cargarDocumentos();
    if (v === 'por-emitir') this.cargarPorEmitir();
  }

  cambiarProveedor(): void { this.forma.credenciales = {}; this.catalogos = null; this.armarCampos(); }

  // ── Conexión ────────────────────────────────────────────────────────────

  probar(): void {
    this.probando = true;
    this.aviso = null;
    this.svc.probar(this.forma.proveedor, this.forma.credenciales).subscribe({
      next: (r: any) => { this.probando = false; this.aviso = { texto: r?.message ?? 'Listo', tipo: r?.error ? 'danger' : 'ok' }; },
      error: (e) => { this.probando = false; this.aviso = { texto: e?.error?.message ?? 'No se pudo probar la conexión.', tipo: 'danger' }; },
    });
  }

  cargarCatalogos(): void {
    this.cargandoCatalogos = true;
    this.svc.catalogos().subscribe({
      next: (r: any) => {
        this.cargandoCatalogos = false;
        if (r?.error) { this.aviso = { texto: r.message, tipo: 'danger' }; return; }
        this.catalogos = r?.data ?? {};
      },
      error: (e) => { this.cargandoCatalogos = false; this.aviso = { texto: e?.error?.message ?? 'No se pudieron traer las opciones de su cuenta.', tipo: 'danger' }; },
    });
  }

  alElegirImpuesto(): void {
    const imp = (this.catalogos?.['impuestos'] ?? []).find(i => String(i.id) === String(this.forma.ajustes['impuesto_id']));
    if (imp?.porcentaje !== undefined) this.forma.ajustes['impuesto_porcentaje'] = imp.porcentaje;
  }

  alternarEstrato(e: number): void {
    const lista: number[] = this.forma.ajustes['estratos_excluidos'] ?? [];
    this.forma.ajustes['estratos_excluidos'] = lista.includes(e) ? lista.filter(x => x !== e) : [...lista, e].sort();
  }

  guardar(): void {
    this.guardando = true;
    this.aviso = null;
    this.svc.guardar({ ...this.forma, emitir_desde: this.forma.emitir_desde || null }).subscribe({
      next: (r: any) => {
        this.guardando = false;
        this.aviso = { texto: r?.message ?? 'Guardado.', tipo: r?.error ? 'danger' : 'ok' };
        this.forma.credenciales = {};
        this.cargar();
      },
      error: (e) => { this.guardando = false; this.aviso = { texto: e?.error?.message ?? 'No se pudo guardar.', tipo: 'danger' }; },
    });
  }

  // ── Documentos ──────────────────────────────────────────────────────────

  cargarDocumentos(pagina = 1): void {
    this.pagina = pagina;
    this.cargandoDocs = true;
    this.svc.documentos({ estado: this.filtroEstado, q: this.buscar.trim(), pagina }).subscribe({
      next: (r: any) => { this.cargandoDocs = false; this.documentos = r?.data?.documentos ?? []; this.totalDocumentos = r?.data?.total ?? 0; },
      error: () => { this.cargandoDocs = false; },
    });
  }

  filtrar(estado: string): void { this.filtroEstado = estado; this.cargarDocumentos(); }

  reintentar(d: DocumentoFE): void {
    this.ocupado[d.id] = 'reintentar';
    this.svc.reintentar(d.id).subscribe({
      next: (r: any) => { delete this.ocupado[d.id]; this.aviso = { texto: r?.message ?? 'Listo', tipo: r?.error ? 'danger' : 'ok' }; this.cargarDocumentos(this.pagina); this.cargar(); },
      error: (e) => { delete this.ocupado[d.id]; this.aviso = { texto: e?.error?.message ?? 'No se pudo reintentar.', tipo: 'danger' }; },
    });
  }

  notaCredito(d: DocumentoFE): void {
    if (!confirm(`Se va a emitir ante la DIAN una nota crédito que anula la factura ${d.numero}. Esto no se puede deshacer. ¿Continuar?`)) return;
    this.ocupado[d.id] = 'nc';
    this.svc.notaCredito(d.id).subscribe({
      next: (r: any) => { delete this.ocupado[d.id]; this.aviso = { texto: r?.message ?? 'Listo', tipo: r?.error ? 'danger' : 'ok' }; this.cargarDocumentos(this.pagina); },
      error: (e) => { delete this.ocupado[d.id]; this.aviso = { texto: e?.error?.message ?? 'No se pudo emitir la nota crédito.', tipo: 'danger' }; },
    });
  }

  verPdf(d: DocumentoFE): void {
    if (d.pdf_url) { window.open(d.pdf_url, '_blank', 'noopener'); return; }
    this.ocupado[d.id] = 'pdf';
    this.svc.pdf(d.id).subscribe({
      next: (blob) => { delete this.ocupado[d.id]; const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); },
      error: () => { delete this.ocupado[d.id]; this.aviso = { texto: 'El proveedor no entregó el PDF de este documento.', tipo: 'danger' }; },
    });
  }

  etiqueta(estado: string): string {
    return ({ emitida: 'Aceptada', rechazada: 'Con novedad', error: 'Reintentando', pendiente: 'Esperando a la DIAN' } as Record<string, string>)[estado] ?? estado;
  }

  // ── Por emitir ──────────────────────────────────────────────────────────

  cargarPorEmitir(): void {
    this.cargandoDocs = true;
    this.marcadas.clear();
    this.svc.porEmitir().subscribe({
      next: (r: any) => { this.cargandoDocs = false; this.porEmitir = r?.data?.facturas ?? []; this.totalPorEmitir = r?.data?.total ?? 0; },
      error: () => { this.cargandoDocs = false; },
    });
  }

  marcar(id: number): void { this.marcadas.has(id) ? this.marcadas.delete(id) : (this.marcadas.size < 10 && this.marcadas.add(id)); }
  marcarTodas(): void {
    if (this.todasMarcadas) { this.marcadas.clear(); return; }
    this.porEmitir.slice(0, 10).forEach(f => this.marcadas.add(f.id));
  }

  emitirMarcadas(): void {
    if (!this.marcadas.size) return;
    if (!confirm(`Se van a emitir ${this.marcadas.size} factura(s) electrónica(s) ante la DIAN. Una factura aceptada no se puede borrar, sólo anular con nota crédito. ¿Continuar?`)) return;
    this.emitiendo = true;
    this.aviso = null;
    this.svc.emitir([...this.marcadas]).subscribe({
      next: (r: any) => { this.emitiendo = false; this.aviso = { texto: r?.message ?? 'Listo', tipo: r?.error ? 'danger' : 'ok' }; this.cargarPorEmitir(); this.cargar(); },
      error: (e) => { this.emitiendo = false; this.aviso = { texto: e?.error?.message ?? 'No se pudieron emitir.', tipo: 'danger' }; },
    });
  }
}
