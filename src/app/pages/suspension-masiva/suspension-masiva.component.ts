import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SuspensionMasivaService } from '../../services/suspension-masiva.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

type Accion = 'avisar' | 'suspender' | 'suspender_y_avisar';

interface Fila {
  user_id: number; nombre: string; dni: string; telefono: string; telefono_valido: boolean; plan: string; tipo: string; grupo: number;
  suspendido: boolean; facturas: number; total: number; mas_vieja: string; dias_mora: number; detalle: any[];
  // Calculado una vez, para que la tabla no llame funciones en cada pintada.
  marcado: boolean; abierto: boolean; totalTexto: string; viejaTexto: string; buscar: string;
}

const ACCIONES: Record<Accion, { titulo: string; detalle: string; boton: string }> = {
  avisar: { titulo: 'Solo avisar', detalle: 'Les llega el mensaje por WhatsApp. No se suspende a nadie.', boton: 'Enviar el aviso' },
  suspender: { titulo: 'Solo suspender', detalle: 'Se corta el servicio en el router. No se les escribe.', boton: 'Suspender' },
  suspender_y_avisar: { titulo: 'Suspender y avisar', detalle: 'Se corta el servicio y, a los que quedaron suspendidos, se les escribe.', boton: 'Suspender y avisar' },
};

/**
 * Suspensión masiva por grupo de corte.
 *
 * El operador ve a los clientes con facturas vencidas de un corte, con el detalle de lo que debe
 * cada uno, quita a quien quiera y ordena avisarles, suspenderlos o las dos cosas. Nada pasa hasta
 * que confirma: la lista es sólo una consulta.
 */
@Component({
  selector: 'app-suspension-masiva',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './suspension-masiva.component.html',
  styleUrl: './suspension-masiva.component.scss',
  host: { class: 'np-console' },
})
export class SuspensionMasivaComponent implements OnInit, OnDestroy {
  private api = inject(SuspensionMasivaService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  cargando = true;
  negado = '';
  vista: 'lista' | 'historial' = 'lista';

  // Opciones
  grupos: Array<{ id: string; texto: string; clientes: number }> = [];
  avisos: any[] = [];
  conMeta = false;
  limite: number | null = null;
  historial: any[] = [];

  // Filtros
  grupo = 'todos';
  servicio = 'activo';
  minFacturas = 1;
  q = '';

  // Lista
  cargandoLista = false;
  filas: Fila[] = [];
  visibles: Fila[] = [];
  marcados = 0;
  deudaMarcada = '$ 0';
  sinTelefono = 0;
  todosMarcados = false;

  // La orden
  accion: Accion = 'avisar';
  avisoId = '';
  avisoElegido: any = null;
  texto = 'Tiene un saldo pendiente de {total_pendiente} ({dias_mora} días de mora). Si no registramos el pago antes del {fecha}, su servicio será suspendido.';
  fechaLimite = '';
  motivo = '';
  vistaPrevia = '';
  problema = '';
  enviando = false;

  // Avance
  lote: any = null;
  progreso = 0;
  fallas: any[] = [];
  private reloj: any = null;
  /** La orden cuyo avance está a la vista. Una respuesta que llega tarde de otra (o de una ya cerrada) no reabre la ventana. */
  private siguiendo: number | null = null;

  readonly ACCIONES = ACCIONES;
  readonly LISTA_ACCIONES: Accion[] = ['avisar', 'suspender', 'suspender_y_avisar'];
  readonly SERVICIOS = [
    { id: 'activo', texto: 'Con servicio' }, { id: 'suspendido', texto: 'Ya suspendidos' }, { id: 'todos', texto: 'Todos' },
  ];
  readonly MINIMOS = [1, 2, 3];

  ngOnInit(): void {
    this.api.opciones().subscribe({
      next: (r) => {
        this.cargando = false;
        const d = r?.data;
        if (!d) { this.negado = r?.message || 'No se pudo abrir.'; return; }
        this.grupos = [{ id: 'todos', texto: 'Todos los cortes', clientes: 0 }, ...(d.grupos || []).map((g: any) => ({ id: String(g.grupo), texto: `Corte del día ${g.dia}`, clientes: g.clientes }))];
        if (this.grupos.length > 1) this.grupo = this.grupos[1].id;
        this.conMeta = !!d.meta;
        this.limite = d.limite?.maximo ?? null;
        this.avisos = d.avisos || [];
        const usable = this.avisos.find(a => a.se_puede) || this.avisos[0];
        if (usable) this.elegirAviso(usable.id);
        if (!this.conMeta) this.accion = 'suspender';
        this.historial = this.conFormato(d.historial || []);
        const enCurso = (d.historial || []).find((l: any) => l.estado === 'pendiente' || l.estado === 'en_curso');
        if (enCurso) this.seguir(enCurso.id);
        this.cargar();
      },
      error: (e) => { this.cargando = false; this.negado = e?.error?.message || 'Esta pantalla es sólo para el administrador.'; },
    });
  }

  ngOnDestroy(): void { clearInterval(this.reloj); }

  // ── La lista ─────────────────────────────────────────────────────────────

  cargar(): void {
    this.cargandoLista = true;
    this.api.candidatos({ grupo: this.grupo, servicio: this.servicio, min_facturas: this.minFacturas }).subscribe({
      next: (r) => {
        this.cargandoLista = false;
        this.filas = (r?.data?.clientes || []).map((c: any) => ({
          ...c, marcado: true, abierto: false,
          totalTexto: this.pesos(c.total), viejaTexto: this.fecha(c.mas_vieja),
          buscar: `${c.nombre} ${c.dni} ${c.telefono}`.toLowerCase(),
          detalle: (c.detalle || []).map((d: any) => ({ ...d, fechaTexto: this.fecha(d.fecha), saldoTexto: this.pesos(d.saldo), abonadoTexto: d.abonado > 0 ? this.pesos(d.abonado) : '' })),
        }));
        this.filtrar();
      },
      error: () => { this.cargandoLista = false; this.toast.error('No se pudo cargar la lista.'); },
    });
  }

  elegirGrupo(id: string): void { this.grupo = id; this.cargar(); }
  elegirServicio(id: string): void {
    this.servicio = id;
    // A los que ya están suspendidos sólo se les puede avisar.
    if (id !== 'activo' && this.accion !== 'avisar') this.accion = 'avisar';
    this.cargar();
  }
  elegirMinimo(n: number): void { this.minFacturas = n; this.cargar(); }

  filtrar(): void {
    const t = this.q.trim().toLowerCase();
    this.visibles = t ? this.filas.filter(f => f.buscar.includes(t)) : this.filas;
    this.recontar();
  }

  alternar(f: Fila): void { f.marcado = !f.marcado; this.recontar(); }
  abrir(f: Fila): void { f.abierto = !f.abierto; }

  marcarTodos(): void {
    const valor = !this.todosMarcados;
    this.visibles.forEach(f => (f.marcado = valor));
    this.recontar();
  }

  private recontar(): void {
    const m = this.filas.filter(f => f.marcado);
    this.marcados = m.length;
    this.deudaMarcada = this.pesos(m.reduce((a, f) => a + f.total, 0));
    this.sinTelefono = m.filter(f => !f.telefono_valido).length;
    this.todosMarcados = this.visibles.length > 0 && this.visibles.every(f => f.marcado);
    this.revisar();
  }

  // ── La orden ─────────────────────────────────────────────────────────────

  elegirAccion(a: Accion): void {
    if (a !== 'avisar' && this.servicio !== 'activo') { this.toast.error('Para suspender, deje el filtro en «Con servicio».'); return; }
    if (a !== 'suspender' && !this.conMeta) { this.toast.error('Para avisar hace falta tener conectada la API de Meta.'); return; }
    this.accion = a;
    this.revisar();
  }

  elegirAviso(id: string): void {
    this.avisoId = id;
    this.avisoElegido = this.avisos.find(a => a.id === id) || null;
    this.revisar();
  }

  /** Arma la vista previa con el primer cliente marcado y dice qué falta para poder enviar. */
  revisar(): void {
    const avisa = this.accion !== 'suspender';
    const a = this.avisoElegido;
    this.problema = '';
    this.vistaPrevia = '';

    if (!this.marcados) { this.problema = 'Marque al menos un cliente.'; return; }
    if (!avisa) return;
    if (!a) { this.problema = 'Elija con qué plantilla se les avisa.'; return; }
    if (!a.se_puede) { this.problema = a.problema; return; }
    if (a.pide_fecha && !this.fechaLimite) this.problema = 'Indique la fecha límite de pago que va en el mensaje.';
    if (a.pide_texto && !this.texto.trim()) this.problema = 'Escriba el mensaje.';
    if (a.pide_texto && this.texto.includes('{fecha}') && !this.fechaLimite) this.problema = 'El mensaje dice {fecha}: indique la fecha límite de pago.';
    if (this.limite !== null && this.marcados - this.sinTelefono > this.limite) {
      this.problema = `Son ${this.marcados - this.sinTelefono} avisos y su número puede contactar a ${this.limite} clientes distintos cada 24 horas. Quite clientes o avise en dos días.`;
    }

    const c = this.filas.find(f => f.marcado);
    if (!c || !a.cuerpo) return;
    const limite = this.fechaLimite ? this.fecha(this.fechaLimite, true) : '(fecha límite)';
    const datos: Record<string, string> = {
      cliente: this.primerNombre(c.nombre), cliente_completo: c.nombre, plan: c.plan || '-', total_pendiente: this.pesos(c.total).replace('$ ', '$'), saldo: this.pesos(c.total).replace('$ ', '$'),
      valor_numero: this.pesos(c.total).replace('$ ', ''), dias_mora: String(c.dias_mora), fecha_vencimiento: limite, fecha_vence: this.fecha(c.mas_vieja, true),
      factura: c.detalle[0]?.numero || '', numero_factura: c.detalle[0]?.numero || '', fecha: limite, empresa: 'su empresa', soporte: '(su teléfono de soporte)',
    };
    datos['texto_libre'] = this.texto.replace(/\{\s*([a-z_]+)\s*\}/g, (m, k) => datos[k] ?? m).replace(/\s+/g, ' ').trim();
    this.vistaPrevia = String(a.cuerpo).replace(/\{\{(\d+)\}\}/g, (_m: string, n: string) => datos[a.variables[Number(n) - 1]] ?? '-');
  }

  ordenar(): void {
    if (this.problema || this.enviando) return;
    const avisa = this.accion !== 'suspender';
    const corta = this.accion !== 'avisar';
    const n = this.marcados;
    const partes = [
      corta ? `Se va a SUSPENDER el servicio a ${n} cliente(s): se les corta el internet en el router.` : `Se le va a escribir por WhatsApp a ${n - this.sinTelefono} cliente(s). No se suspende a nadie.`,
      corta && avisa ? 'A los que queden suspendidos se les envía el mensaje por WhatsApp.' : '',
      avisa && this.sinTelefono ? `${this.sinTelefono} no tienen un celular válido: a esos el mensaje les va a fallar.` : '',
      corta ? 'Esto no se deshace de una vez: cada cliente se reactiva al pagar o a mano.' : 'Un mensaje enviado no se puede retirar.',
    ].filter(Boolean).join(' ');

    this.dialog.confirm(partes + ' ¿Continuar?', { title: ACCIONES[this.accion].titulo, okLabel: ACCIONES[this.accion].boton, danger: corta }).then((ok: boolean) => {
      if (!ok) return;
      this.enviando = true;
      this.api.crear({
        accion: this.accion, clientes: this.filas.filter(f => f.marcado).map(f => f.user_id), grupo: this.grupo,
        aviso: avisa ? this.avisoId : null, texto: avisa && this.avisoElegido?.pide_texto ? this.texto.replace('{fecha}', this.fechaLimite ? this.fecha(this.fechaLimite, true) : '{fecha}') : null,
        fecha_limite: avisa && this.fechaLimite ? this.fecha(this.fechaLimite, true) : null, motivo: this.motivo.trim() || null,
      }).subscribe({
        next: (r) => {
          this.enviando = false;
          if (r?.error) { this.toast.error(r.message); return; }
          this.toast.success(r.message);
          this.seguir(r.data.id);
        },
        error: (e) => {
          this.enviando = false;
          const errores = e?.error?.errors ? (Object.values(e.error.errors) as string[][]).flat().join(' ') : '';
          this.toast.error(errores || e?.error?.message || 'No se pudo crear la orden.');
        },
      });
    });
  }

  // ── El avance ────────────────────────────────────────────────────────────

  seguir(id: number): void {
    clearInterval(this.reloj);
    this.siguiendo = id;
    const leer = () => this.api.ver(id).subscribe({ next: (r) => { if (r?.data && this.siguiendo === id) this.mostrar(r.data); } });
    leer();
    this.reloj = setInterval(leer, 2500);
  }

  private mostrar(l: any): void {
    const total = l.total || 1;
    const terminado = l.estado === 'terminado' || l.estado === 'cancelado';
    this.lote = {
      ...l,
      tituloAccion: ACCIONES[l.accion as Accion]?.titulo || l.accion,
      enCurso: !terminado,
      estadoTexto: ({ pendiente: 'Empezando…', en_curso: 'En curso', terminado: 'Terminó', cancelado: 'Cancelada' } as any)[l.estado] || l.estado,
    };
    this.progreso = terminado ? 100 : Math.min(99, Math.round(((l.procesados || 0) * 100) / total));
    this.fallas = (l.clientes || []).filter((c: any) => c.error).map((c: any) => ({ ...c, deudaTexto: this.pesos(c.deuda) }));

    if (terminado) {
      clearInterval(this.reloj);
      this.api.opciones().subscribe({ next: (r) => { this.historial = this.conFormato(r?.data?.historial || []); } });
      this.cargar();
    }
  }

  cancelar(): void {
    if (!this.lote) return;
    this.dialog.confirm('Se detiene lo que falta. Los clientes ya suspendidos o avisados quedan como están. ¿Cancelar la orden?', { title: 'Cancelar la orden', okLabel: 'Sí, cancelar', danger: true })
      .then((ok: boolean) => { if (ok && this.lote) this.api.cancelar(this.lote.id).subscribe({ next: (r) => { this.toast.success(r?.message || 'Cancelada'); if (r?.data && this.siguiendo === r.data.id) this.mostrar(r.data); } }); });
  }

  cerrarAvance(): void {
    if (this.lote?.enCurso) return;
    clearInterval(this.reloj);
    this.siguiendo = null;
    this.lote = null;
  }
  verLote(l: any): void { this.seguir(l.id); }

  // ── Formato ──────────────────────────────────────────────────────────────

  private conFormato(lotes: any[]): any[] {
    return lotes.map(l => ({
      ...l,
      accionTexto: ACCIONES[l.accion as Accion]?.titulo || l.accion,
      cuando: new Date(String(l.created_at).replace(' ', 'T')).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
      estadoTexto: ({ pendiente: 'Empezando', en_curso: 'En curso', terminado: 'Terminó', cancelado: 'Cancelada' } as any)[l.estado] || l.estado,
      tono: l.estado === 'terminado' ? (l.fallidos ? 'warn' : 'ok') : (l.estado === 'cancelado' ? 'neutro' : 'info'),
    }));
  }

  private pesos(v: number): string { return '$ ' + Math.round(Number(v) || 0).toLocaleString('es-CO'); }

  private fecha(f: string, numerica = false): string {
    if (!f) return '';
    const [a, m, d] = f.slice(0, 10).split('-').map(Number);
    const x = new Date(a, m - 1, d);
    return numerica ? `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}` : x.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private primerNombre(n: string): string {
    const p = (n || '').trim().split(/\s+/)[0] || 'Cliente';
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }

  trackId = (_: number, x: any) => x.id ?? x.user_id;
  trackI = (i: number) => i;
}
