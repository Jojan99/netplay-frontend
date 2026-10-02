import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Subject, Subscription, debounceTime, switchMap, tap } from 'rxjs';
import { DarkThemeToggleComponent } from '../../common/dark-theme-toggle.component';
import { Disponibilidad, SitioService } from '../../services/sitio.service';

interface Plan {
  clave: string;
  nombre: string;
  para: string;
  precio_mensual: number | null;
  precio_anual?: number | null;
  clientes: number | null;
  destacado: boolean;
  incluye: string[];
}

/** Cuánto paga un ISP de cada tamaño en Netvula y en otras combinaciones, según sus precios publicados. */
interface Comparativo {
  fecha: string | null;
  trm: number;
  tamanos: { clientes: number; olts: number; netvula: number; plan: string; plan_clientes: number | null }[];
  alternativas: { nombre: string; detalle: string | null; usd: number[]; cop: number[] }[];
  /** El complemento TR-069, tramo por tramo, contra quien también lo vende aparte. */
  tr069?: { tramos: { hasta: number; precio: number }[]; alternativas: { nombre: string; detalle: string | null; usd: number[]; cop: number[] }[] };
  fuentes: { nombre: string; url: string }[];
}

/**
 * netvula.com: la página pública de la plataforma. Muestra qué resuelve,
 * los planes y deja reservar la dirección de la empresa antes de registrarla.
 * Cada empresa, en cambio, entra por su subdominio y ve su propio login.
 */
@Component({
  selector: 'app-plataforma',
  standalone: true,
  imports: [CommonModule, RouterModule, DarkThemeToggleComponent],
  templateUrl: './plataforma.component.html',
  styleUrl: './plataforma.component.scss',
})
export class PlataformaComponent implements OnInit, OnDestroy {
  private sitio  = inject(SitioService);
  private router = inject(Router);

  nombre  = signal('Netvula');
  dominio = signal('netvula.com');

  planes       = signal<Plan[]>([]);
  planesListos = signal(false);
  /** Todos los planes traen todas las funciones: esto va una sola vez, debajo. */
  incluyeTodos = signal<string[]>([]);
  pruebaDias   = signal(0);
  notaPrecios  = signal('');
  private moneda = 'COP';

  deseado   = '';
  revisando = signal(false);
  resultado = signal<Disponibilidad | null>(null);
  private escritura = new Subject<string>();
  private subs = new Subscription();

  /** Con sesión abierta en este navegador se ofrece volver al panel. */
  readonly conSesion = (() => {
    try { return typeof localStorage !== 'undefined' && !!localStorage.getItem('token'); } catch { return false; }
  })();

  readonly anio = new Date().getFullYear();

  /** Lo que diferencia a la plataforma, en cuatro frases. Va antes del detalle por áreas. */
  readonly claves = [
    { titulo: 'Un solo precio', detalle: 'Paga por clientes. No cobramos por OLT, por router ni por usuario del panel.' },
    { titulo: 'Todo conectado', detalle: 'El pago reactiva el servicio, el corte avisa por WhatsApp y la instalación crea el cliente.' },
    { titulo: 'Con su marca', detalle: 'Panel y portal de clientes en su propia dirección, con su nombre y su logo.' },
    { titulo: 'Sin servidor propio', detalle: 'Corre en la nube y llega a su red por un túnel VPN cifrado.' },
  ];

  /**
   * Las funciones de la plataforma, por área. Se escriben aquí y no salen del
   * catálogo de permisos: aquel nombra módulos para quien administra perfiles
   * («Crear tickets», «WhatsApp (config.)»), no lo que le resuelve a un ISP.
   * Al agregar una función al producto, agregarla también acá.
   */
  readonly areas = [
    {
      id: 'f-clientes', corto: 'Clientes', titulo: 'Clientes y servicio',
      promesa: 'Del primer contacto a la instalación, sin hojas de cálculo.',
      icono: 'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15 3.6a3.5 3.5 0 0 1 0 6.8',
      funciones: [
        { n: 'Ficha única del cliente', d: 'Datos, servicio, facturas, tickets e historial en una sola vista.' },
        { n: 'Planes y velocidades', d: 'Cree sus planes y cambie la velocidad de un cliente o de todo un plan.' },
        { n: 'Contratos con firma electrónica', d: 'El cliente firma con un enlace, sin papel ni visitas.' },
        { n: 'Instalaciones', d: 'Agenda, técnico asignado y comisión; la orden crea el cliente y autoriza su equipo.' },
        { n: 'Traslados', d: 'Cambio de dirección con su propia orden y seguimiento.' },
        { n: 'Migración desde WispHub o Mikrowisp', d: 'Traiga sus clientes con su plan, router y conexión, sin volver a digitar.' },
      ],
    },
    {
      id: 'f-cartera', corto: 'Facturación', titulo: 'Facturación y cartera',
      promesa: 'Facture, cobre y concilie sin perseguir pagos.',
      icono: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM3 10h18M7 15h4',
      funciones: [
        { n: 'Facturación por grupos de corte', d: 'Las facturas salen solas en la fecha de corte de cada cliente.' },
        { n: 'Corte y reactivación por mora', d: 'El servicio se suspende al vencer y vuelve solo cuando entra el pago.' },
        { n: 'Pagos en línea', d: 'Wompi, ePayco, OnePay, EfiPay o ZonaPagos con su propia cuenta, y enlaces de pago por WhatsApp.' },
        { n: 'Abonos y compromisos de pago', d: 'Pagos parciales y acuerdos con fecha, con seguimiento automático.' },
        { n: 'Conciliación de pagos', d: 'Pegue el listado del banco: la plataforma encuentra al cliente y sus facturas.' },
        { n: 'Comprobantes revisados solos', d: 'Lee el comprobante que envía el cliente y lo aplica si todo coincide.' },
        { n: 'Egresos y resumen financiero', d: 'Gastos por categoría, ingresos contra egresos e indicadores del negocio.' },
        { n: 'Cartera y reportes', d: 'Quién debe, cuánto y desde cuándo, con exportación a CSV.' },
      ],
    },
    {
      id: 'f-red', corto: 'Red', titulo: 'Red: OLT y MikroTik',
      promesa: 'Su red FTTH, sin abrir la consola.',
      icono: 'M5 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM19 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7 12h4l6-6M11 12l6 6',
      funciones: [
        { n: 'OLT Huawei, ZTE y C-Data', d: 'Autorice ONT y cambie perfiles y VLAN desde el panel. Sin costo por OLT.' },
        { n: 'Señal de cada cliente', d: 'Potencia óptica, distancia y estado de la ONT, en vivo desde su ficha.' },
        { n: 'Salud de la red y clientes en riesgo', d: 'Vea qué puertos y qué clientes van a fallar antes de que llamen.' },
        { n: 'Alertas de caída', d: 'Aviso al grupo de WhatsApp de sus técnicos cuando cae un puerto o una OLT.' },
        { n: 'MikroTik', d: 'PPPoE, colas y ancho de banda, y cambio entre IP fija y PPPoE.' },
        { n: 'Autorización en terreno', d: 'Una pantalla recortada para que el técnico autorice la ONT al instalar.' },
        { n: 'Conexión por VPN', d: 'La plataforma llega a sus equipos por un túnel cifrado, sin exponerlos a internet.' },
        { n: 'Inventario', d: 'Equipos, seriales y movimientos; la instalación descuenta del stock.' },
      ],
    },
    {
      id: 'f-whatsapp', corto: 'WhatsApp', titulo: 'WhatsApp y atención',
      promesa: 'Un solo WhatsApp para todo el equipo.',
      icono: 'M4 20l1.3-3.9A8 8 0 1 1 8 19ZM9 10h6M9 13h4',
      funciones: [
        { n: 'Bandeja compartida', d: 'Todo el equipo atiende el mismo número, con cada chat asignado y en su estado.' },
        { n: 'API oficial de Meta o WhatsApp Web', d: 'Conecte su línea como prefiera.' },
        { n: 'Constructor de bots', d: 'Arme el flujo de atención con bloques: menús, consulta de saldo y paso a un agente.' },
        { n: 'Avisos automáticos', d: 'Factura, recordatorio de pago, suspensión y reactivación, sin que nadie los envíe.' },
        { n: 'Campañas y mensajes programados', d: 'Comunicados a todos sus clientes o a un grupo, para la fecha que elija.' },
        { n: 'Asistente de cobranza con IA', d: 'Conversa con el cliente en mora y propone acuerdos dentro de los límites que usted fije.' },
        { n: 'Tickets de soporte', d: 'Con el diagnóstico del equipo y la señal del cliente a la vista.' },
      ],
    },
    {
      id: 'f-portal', corto: 'Portal', titulo: 'Portal de sus clientes',
      promesa: 'Su marca, en la dirección de su empresa.',
      icono: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM9 21h6M12 17v4M8 9h8M8 12h5',
      funciones: [
        { n: 'Con su nombre y su logo', d: 'En su subdominio o en su propio dominio.' },
        { n: 'Pago en línea', d: 'El cliente paga su factura y el servicio se reactiva sin llamar a nadie.' },
        { n: 'Facturas y recibos', d: 'Estado de cuenta, historial de pagos y descarga del recibo.' },
        { n: 'Reporte de fallas', d: 'El cliente abre su ticket y sigue la respuesta desde el portal.' },
        { n: 'Contratos y estado del servicio', d: 'Todo lo de su cuenta, sin escribirle a soporte.' },
      ],
    },
    {
      id: 'f-equipo', corto: 'Equipo', titulo: 'Equipo y control',
      promesa: 'Cada quien ve lo suyo, y queda registro de todo.',
      icono: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6ZM9 12l2 2 4-4',
      funciones: [
        { n: 'Perfiles y permisos', d: 'Administrador, Técnico y Contador, con los módulos que usted decida.' },
        { n: 'Mapa de técnicos', d: 'Dónde está cada técnico durante su jornada.' },
        { n: 'Empleados', d: 'Nómina, contratos y dotación de su personal.' },
        { n: 'Registro de cambios', d: 'Quién modificó qué y cuándo, en clientes, pagos y red.' },
        { n: 'Tablero a su medida', d: 'Arme su pantalla de inicio con los paneles que usa cada día.' },
        { n: 'En el celular', d: 'El panel se adapta al teléfono del técnico, con modo claro y oscuro.' },
      ],
    },
  ];

  /** Lo que agrega el complemento TR-069. */
  readonly tr069 = [
    { n: 'WiFi del cliente', d: 'Cambie el nombre y la contraseña de la red sin ir al domicilio.' },
    { n: 'Reinicio remoto', d: 'Reinicie el equipo desde la ficha del cliente.' },
    { n: 'Consumo de datos', d: 'Cuánto consume cada cliente, día por día.' },
    { n: 'La ONT se configura sola', d: 'Al instalar, recibe su conexión y su WiFi sin que el técnico entre al equipo.' },
    { n: '«Mi WiFi» en el portal', d: 'El cliente cambia su propia contraseña y ve qué tiene conectado.' },
    { n: 'Reparación automática', d: 'Si un equipo pierde su configuración al reiniciarse, la plataforma la repone.' },
  ];

  /** Precio del complemento (el del primer tramo) y sus tramos por equipos, como los entrega el servidor. */
  precioTr069 = signal('');
  tramosTr069 = signal<{ hasta: number; precio: number }[]>([]);

  /** El comparativo de precios; null si el servidor no lo envía (se apaga desde la configuración). */
  comparativo = signal<Comparativo | null>(null);

  /** Lo que se ahorra al mes en ese tamaño frente a la alternativa más barata de la tabla. */
  ahorro(i: number): number {
    const c = this.comparativo();
    if (!c) return 0;
    return Math.min(...c.alternativas.map(a => a.cop[i])) - c.tamanos[i].netvula;
  }

  /** Lo que se ahorra en el complemento TR-069, en ese tramo, frente a la alternativa más barata. */
  ahorroTr069(i: number): number {
    const t = this.comparativo()?.tr069;
    if (!t?.alternativas.length) return 0;
    return Math.min(...t.alternativas.map(a => a.cop[i])) - t.tramos[i].precio;
  }

  enPesos(valor: number): string { return this.pesos(valor); }
  miles(valor: number): string { return Math.round(valor).toLocaleString('es-CO'); }

  readonly pasos = [
    { n: '01', titulo: 'Registre la empresa', detalle: 'NIT, correo y el usuario administrador. Se crean los perfiles de Administrador, Técnico y Contador.' },
    { n: '02', titulo: 'Ingrese por su dirección', detalle: 'Confirma el correo y su equipo entra por tuempresa.netvula.com, con su nombre y su logo.' },
    { n: '03', titulo: 'Conecte la red', detalle: 'El panel le guía para enlazar el MikroTik por VPN, dar de alta la OLT y cargar sus planes.' },
  ];

  readonly preguntas = [
    { p: '¿Necesito un servidor propio?', r: 'No. La plataforma corre en la nube y se conecta a su red por un túnel VPN cifrado hacia su MikroTik. Si ya tiene un servidor TR-069, también lo puede usar.' },
    { p: '¿Con qué equipos funciona?', r: 'OLT Huawei, ZTE y C-Data y routers MikroTik (PPPoE, colas y cortes por mora). Con el complemento TR-069, también gestiona las ONT y routers de sus clientes que hablen ese protocolo.' },
    { p: '¿Cobran por cada OLT o por cada router?', r: 'No. El precio depende de cuántos clientes tiene, no de cuántas OLT, routers o usuarios del panel use.' },
    { p: '¿Mis clientes ven mi marca?', r: 'Sí. El portal de clientes y el login del panel muestran el nombre y el logo de su empresa en su propia dirección.' },
    { p: '¿Los datos de mi empresa están separados?', r: 'Cada empresa ve sólo sus clientes, facturas y equipos. El acceso de cada usuario depende del perfil que usted le asigne.' },
    { p: '¿Puedo migrar mis clientes actuales?', r: 'Sí. Le acompañamos a cargar clientes, planes y saldos para arrancar sin volver a digitar todo.' },
  ];

  ngOnInit(): void {
    this.subs.add(this.sitio.cargar().subscribe(s => {
      if (s?.plataforma?.nombre)  this.nombre.set(s.plataforma.nombre);
      if (s?.plataforma?.dominio) this.dominio.set(s.plataforma.dominio);
    }));

    this.subs.add(this.sitio.planes().subscribe({
      next: d => {
        this.planes.set(d?.planes ?? []);
        this.incluyeTodos.set(d?.incluye_todos ?? []);
        this.pruebaDias.set(Number(d?.prueba_dias) || 0);
        this.notaPrecios.set(d?.nota_precios ?? '');
        this.moneda = d?.moneda || 'COP';
        this.comparativo.set(d?.comparativo ?? null);
        const tr = (d?.complementos ?? []).find((c: any) => c?.clave === 'tr069');
        this.precioTr069.set(tr?.precio ? this.pesos(Number(tr.precio)) : '');
        this.tramosTr069.set(tr?.tramos ?? []);
        this.planesListos.set(true);
      },
      error: () => this.planesListos.set(true),
    }));

    this.subs.add(this.escritura.pipe(
      debounceTime(350),
      tap(() => this.revisando.set(true)),
      switchMap(s => this.sitio.disponible(s)),
    ).subscribe(r => {
      this.revisando.set(false);
      // Sólo cuenta la respuesta de lo que sigue escrito.
      if (r.subdominio === this.deseado) this.resultado.set(r);
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  /** Deja sólo lo que admite un subdominio mientras se escribe. */
  alEscribir(campo: HTMLInputElement): void {
    const limpio = campo.value.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      .slice(0, 40);

    if (campo.value !== limpio) {
      // Sin esto el cursor saltaba al final al corregir una letra en el medio.
      const cursor = Math.min(campo.selectionStart ?? limpio.length, limpio.length);
      campo.value = limpio;
      campo.setSelectionRange(cursor, cursor);
    }

    this.deseado = limpio;
    this.resultado.set(null);

    if (limpio.length >= 3) this.escritura.next(limpio);
    else this.revisando.set(false);
  }

  reservar(evento: Event): void {
    evento.preventDefault();
    const r = this.resultado();
    this.router.navigate(['/register'], { queryParams: r?.disponible ? { subdominio: r.subdominio } : {} });
  }

  elegirPlan(plan: Plan): void {
    const r = this.resultado();
    this.router.navigate(['/register'], { queryParams: { plan: plan.clave, ...(r?.disponible ? { subdominio: r.subdominio } : {}) } });
  }

  precio(plan: Plan): string {
    return plan.precio_mensual == null ? '' : this.pesos(plan.precio_mensual);
  }

  precioAnual(plan: Plan): string {
    return plan.precio_anual == null ? '' : this.pesos(plan.precio_anual);
  }

  private pesos(valor: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: this.moneda, maximumFractionDigits: 0 }).format(valor);
  }

  clientes(plan: Plan): string {
    return plan.clientes ? `Hasta ${plan.clientes.toLocaleString('es-CO')} clientes` : 'Clientes sin tope';
  }

  ir(evento: Event, id: string): void {
    evento.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
