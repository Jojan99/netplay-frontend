import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SoporteAsistenteService } from '../../services/soporte-asistente.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

type Vista = 'casos' | 'config' | 'probar';
type Tono = 'ok' | 'warn' | 'danger' | 'info' | 'neutro';

const ESTADOS: Record<string, { texto: string; tono: Tono }> = {
  activo: { texto: 'Conversando', tono: 'info' },
  esperando: { texto: 'Habilitando el equipo', tono: 'warn' },
  resuelto: { texto: 'Resuelto', tono: 'ok' },
  escalado: { texto: 'Pasó a un asesor', tono: 'danger' },
  humano: { texto: 'Lo tomó una persona', tono: 'neutro' },
  cerrado: { texto: 'Sin respuesta', tono: 'neutro' },
};

const CAUSAS: Record<string, string> = {
  suspendido: 'Servicio suspendido', falla_general: 'Falla en el sector', sin_energia: 'Equipo sin energía', sin_fibra: 'Sin señal de fibra',
  equipo_apagado: 'Equipo fuera de línea', senal_mala: 'Señal de fibra débil', sin_sesion: 'No logra conectarse', sin_ip: 'Sin conexión habilitada',
  no_responde: 'El equipo no responde', inestable: 'Conexión inestable', incompleto: 'No se pudo revisar todo', red_bien: 'Red bien: WiFi o aparato', sin_equipo: 'Sin equipo registrado', sin_equipo_sin_conexion: 'Sin equipo registrado y sin conexión', sin_cliente: 'Cliente no encontrado',
};

const ACCIONES: Record<string, string> = {
  clave_cambiada: 'Clave cambiada', clave_programada: 'Clave programada', clave_en_curso: 'Clave en curso', reinicio: 'Reinició el equipo', ticket: 'Ticket',
};

/**
 * El asistente de soporte por WhatsApp.
 *
 * Aquí la empresa lo enciende, decide qué puede hacer por su cuenta (cambiar la clave del
 * WiFi, reiniciar, crear tickets) y ve cada caso con lo que el asistente revisó y contestó.
 */
@Component({
  selector: 'app-soporte-asistente',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './soporte-asistente.component.html',
  styleUrl: './soporte-asistente.component.scss',
})
export class SoporteAsistenteComponent implements OnInit, OnDestroy {
  private api = inject(SoporteAsistenteService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  private router = inject(Router);

  cargando = true;
  negado = '';
  vista: Vista = 'casos';

  cfg: any = null;
  cuenta: any = null;
  hoy: any = null;
  semana: any = null;
  causasSemana: Array<{ nombre: string; n: number; pct: number }> = [];
  avisos: Array<{ tono: Tono; texto: string; enlace?: string; enlaceTexto?: string }> = [];
  guardando = false;

  // Casos
  filtro = 'abiertos';
  q = '';
  casos: any[] = [];
  cargandoCasos = false;
  detalle: any = null;
  cargandoDetalle = false;
  private espera: any = null;
  private reloj: any = null;

  // Probar
  buscado = '';
  clientes: any[] = [];
  elegido: any = null;
  probando = false;
  prueba: any = null;

  readonly FILTROS = [
    { id: 'abiertos', texto: 'En curso' }, { id: 'persona', texto: 'Pasados a una persona' }, { id: 'resueltos', texto: 'Resueltos' }, { id: 'cerrados', texto: 'Sin respuesta' }, { id: '', texto: 'Todos' },
  ];

  ngOnInit(): void {
    this.cargar();
    // Los casos en curso cambian solos: se refrescan mientras la pestaña está abierta.
    this.reloj = setInterval(() => { if (this.vista === 'casos' && !this.detalle && !document.hidden) this.cargarCasos(true); }, 20000);
  }

  ngOnDestroy(): void {
    clearInterval(this.reloj);
    clearTimeout(this.espera);
  }

  cargar(): void {
    this.api.estado().subscribe({
      next: (r) => {
        this.cargando = false;
        const d = r?.data;
        if (!d) { this.negado = r?.message || 'No se pudo abrir el asistente.'; return; }
        this.cfg = { ...d.config, instrucciones: d.config.instrucciones || '', palabras: d.config.palabras || '' };
        this.cuenta = d.con_que_cuenta;
        this.hoy = d.hoy;
        this.semana = d.semana;
        this.armarCausas(d.semana?.por_causa || {});
        this.armarAvisos();
        this.cargarCasos();
      },
      error: (e) => { this.cargando = false; this.negado = e?.error?.message || 'No tiene acceso a esta pantalla.'; },
    });
  }

  private armarCausas(porCausa: Record<string, number>): void {
    const total = Object.values(porCausa).reduce((a, b) => a + b, 0) || 1;
    this.causasSemana = Object.entries(porCausa).map(([k, n]) => ({ nombre: CAUSAS[k] || k, n, pct: Math.round((n * 100) / total) }));
  }

  private armarAvisos(): void {
    const c = this.cuenta;
    const a: typeof this.avisos = [];
    if (!c.ia) a.push({ tono: 'danger', texto: 'No hay una clave de inteligencia artificial configurada. Sin ella el asistente no puede conversar.', enlace: '/dashboard/cobranza', enlaceTexto: 'Conectar la clave' });
    else if (!c.clave_propia) a.push({ tono: 'warn', texto: `Está usando la clave de prueba de Netvula: alcanza para ${c.cupo_de_prueba} conversaciones por día entre cobranza y soporte (hoy van ${c.usadas_hoy}). Con la clave propia de su empresa, gratuita en Google, no hay ese tope.`, enlace: '/dashboard/cobranza', enlaceTexto: 'Conectar la clave propia' });
    if (!c.lineas_web && !c.meta) a.push({ tono: 'danger', texto: 'No hay ninguna línea de WhatsApp conectada (ni WhatsApp Web ni la API de Meta).' });
    if (!c.tr069) a.push({ tono: 'warn', texto: 'Su empresa no tiene activo el complemento TR-069: el asistente diagnostica, pero no puede cambiar claves del WiFi a distancia.' });
    else if (!c.gestion_remota) a.push({ tono: 'info', texto: 'La gestión remota por la OLT no está montada: el asistente sólo podrá cambiar la clave en los equipos que ya reportan al TR-069.' });
    this.avisos = a;
  }

  abrir(v: Vista): void {
    this.vista = v;
    if (v === 'casos') this.cargarCasos();
  }

  // ── Encendido y configuración ────────────────────────────────────────────

  encender(): void {
    if (!this.cfg) return;
    const nueva = !this.cfg.activa;
    if (!nueva) { this.cfg.activa = false; this.guardar(); return; }
    this.dialog.confirm(
      'Desde este momento, cuando un cliente escriba por WhatsApp con un problema de servicio, le contestará el asistente: revisa su conexión y, según lo que usted permita, cambia la clave del WiFi, reinicia el equipo o deja un ticket. ¿Lo activa?',
      { title: 'Activar el asistente de soporte', okLabel: 'Activar' },
    ).then((ok: boolean) => { if (ok) { this.cfg.activa = true; this.guardar(); } });
  }

  alternar(campo: string): void {
    this.cfg[campo] = !this.cfg[campo];
  }

  guardar(): void {
    if (this.guardando) return;
    this.guardando = true;
    const c = this.cfg;
    this.api.guardar({
      activa: !!c.activa, canal_web: !!c.canal_web, canal_meta: !!c.canal_meta, nombre_asistente: (c.nombre_asistente || '').trim(),
      instrucciones: (c.instrucciones || '').trim() || null, permite_cambiar_clave: !!c.permite_cambiar_clave, exige_telefono_registrado: !!c.exige_telefono_registrado,
      permite_reiniciar: !!c.permite_reiniciar, crea_tickets: !!c.crea_tickets, max_casos_dia: Number(c.max_casos_dia) || 80,
      minutos_inactividad: Number(c.minutos_inactividad) || 30, palabras: (c.palabras || '').trim() || null,
    }).subscribe({
      next: (r) => {
        this.guardando = false;
        if (r?.error) { this.toast.error(r.message); this.cargar(); return; }
        this.toast.success(r.message);
      },
      error: (e) => {
        this.guardando = false;
        const errores = e?.error?.errors ? (Object.values(e.error.errors) as string[][]).flat().join(' ') : '';
        this.toast.error(errores || e?.error?.message || 'No se pudo guardar.');
        this.cargar();
      },
    });
  }

  // ── Casos ────────────────────────────────────────────────────────────────

  filtrar(id: string): void {
    this.filtro = id;
    this.cargarCasos();
  }

  buscar(): void {
    clearTimeout(this.espera);
    this.espera = setTimeout(() => this.cargarCasos(), 350);
  }

  cargarCasos(silencio = false): void {
    if (!silencio) this.cargandoCasos = true;
    this.api.casos(this.filtro, this.q.trim()).subscribe({
      next: (r) => {
        this.cargandoCasos = false;
        this.casos = (r?.data || []).map((c: any) => ({
          ...c,
          quien: c.cliente || 'Sin identificar',
          telefonoCorto: this.telefono(c.telefono),
          canalTexto: c.canal === 'meta' ? 'API Meta' : 'WhatsApp Web',
          estadoTexto: ESTADOS[c.estado]?.texto || c.estado,
          tono: ESTADOS[c.estado]?.tono || 'neutro',
          causaTexto: c.causa ? CAUSAS[c.causa] || c.causa : '',
          hizo: (c.acciones || []).map((a: string) => (a === 'ticket' && c.ticket_id ? `Ticket #${c.ticket_id}` : ACCIONES[a])).filter(Boolean),
          cuando: this.cuando(c.ultimo || c.creado),
          abierto: c.estado === 'activo' || c.estado === 'esperando',
        }));
      },
      error: () => { this.cargandoCasos = false; },
    });
  }

  ver(c: any): void {
    this.detalle = { ...c, pasos: [], hechos: [] };
    this.cargandoDetalle = true;
    this.api.caso(c.id).subscribe({
      next: (r) => {
        this.cargandoDetalle = false;
        if (!r?.data || !this.detalle) return;
        this.detalle = { ...this.detalle, ...r.data, pasos: (r.data.pasos || []).map((p: any, i: number) => ({ ...p, i })) };
      },
      error: () => { this.cargandoDetalle = false; },
    });
  }

  cerrarDetalle(): void {
    this.detalle = null;
  }

  tomar(c: any): void {
    this.dialog.confirm(
      'El asistente deja de contestarle a este cliente y la conversación queda para usted en el CRM. ¿Continuar?',
      { title: 'Tomar la conversación', okLabel: 'Tomar la conversación' },
    ).then((ok: boolean) => {
      if (!ok) return;
      this.api.tomar(c.id).subscribe({
        next: (r) => {
          if (r?.error) { this.toast.error(r.message); this.cargarCasos(); return; }
          this.toast.success(r.message);
          this.detalle = null;
          this.cargarCasos();
          if (r.data?.conversation_id) this.router.navigateByUrl(`/dashboard/crm/inbox/${r.data.conversation_id}`);
        },
        error: (e) => this.toast.error(e?.error?.message || 'No se pudo tomar.'),
      });
    });
  }

  // ── Probar el diagnóstico ────────────────────────────────────────────────

  buscarCliente(): void {
    clearTimeout(this.espera);
    this.elegido = null;
    this.prueba = null;
    const q = this.buscado.trim();
    if (q.length < 3) { this.clientes = []; return; }
    this.espera = setTimeout(() => {
      this.api.buscarClientes(q).subscribe({
        next: (r) => { this.clientes = (r?.data || []).map((c: any) => ({ id: c.id, nombre: `${c.names || ''} ${c.lastname || ''}`.trim(), dni: c.dni })); },
        error: () => { this.clientes = []; },
      });
    }, 300);
  }

  elegir(c: any): void {
    this.elegido = c;
    this.clientes = [];
    this.buscado = c.nombre;
    this.probar();
  }

  probar(): void {
    if (!this.elegido || this.probando) return;
    this.probando = true;
    this.prueba = null;
    this.api.probar(this.elegido.id).subscribe({
      next: (r) => {
        this.probando = false;
        if (r?.error) { this.toast.error(r.message); return; }
        this.prueba = { ...r.data, causaTexto: CAUSAS[r.data.clave] || r.data.clave, tono: r.data.clave === 'red_bien' ? 'ok' : (r.data.clave === 'incompleto' ? 'neutro' : 'warn') };
      },
      error: (e) => { this.probando = false; this.toast.error(e?.error?.message || 'No se pudo hacer el diagnóstico.'); },
    });
  }

  // ── Formato ──────────────────────────────────────────────────────────────

  private telefono(t: string): string {
    const d = (t || '').replace(/\D/g, '');
    return d.length === 12 && d.startsWith('57') ? `${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : t;
  }

  private cuando(fecha: string | null): string {
    if (!fecha) return '';
    const f = new Date(fecha.includes('T') ? fecha : fecha.replace(' ', 'T'));
    const min = Math.round((Date.now() - f.getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    if (min < 1440) return `hace ${Math.round(min / 60)} h`;
    return f.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) + ' ' + f.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  }

  trackId = (_: number, x: any) => x.id;
  trackI = (i: number) => i;
}
