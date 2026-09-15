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
  clientes: number | null;
  destacado: boolean;
  incluye: string[];
}

interface GrupoDeModulos {
  grupo: string;
  items: { nombre: string; detalle: string }[];
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
  modulos      = signal<GrupoDeModulos[]>([]);
  planesListos = signal(false);
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

  readonly pasos = [
    { n: '01', titulo: 'Registrá la empresa', detalle: 'NIT, correo y el usuario administrador. Se crean los perfiles de Administrador, Técnico y Contador.' },
    { n: '02', titulo: 'Entrá por tu dirección', detalle: 'Confirmás el correo y tu equipo entra por tuempresa.netvula.com, con tu nombre y tu logo.' },
    { n: '03', titulo: 'Conectá la red', detalle: 'El panel te guía para enlazar el MikroTik por VPN, dar de alta la OLT y cargar tus planes.' },
  ];

  readonly preguntas = [
    { p: '¿Necesito un servidor propio?', r: 'No. La plataforma corre en la nube y se conecta a tu red por un túnel VPN cifrado hacia tu MikroTik. Si ya tenés un servidor TR-069, también lo podés usar.' },
    { p: '¿Con qué equipos funciona?', r: 'OLT Huawei y C-Data, routers MikroTik (PPPoE, colas y cortes por mora) y cualquier ONT o router que hable TR-069.' },
    { p: '¿Mis clientes ven mi marca?', r: 'Sí. El portal de clientes y el login del panel muestran el nombre y el logo de tu empresa en tu propia dirección.' },
    { p: '¿Los datos de mi empresa están separados?', r: 'Cada empresa ve sólo sus clientes, facturas y equipos. El acceso de cada usuario depende del perfil que le asignes.' },
    { p: '¿Puedo migrar mis clientes actuales?', r: 'Sí. Te acompañamos a cargar clientes, planes y saldos para arrancar sin volver a digitar todo.' },
  ];

  ngOnInit(): void {
    this.subs.add(this.sitio.cargar().subscribe(s => {
      if (s?.plataforma?.nombre)  this.nombre.set(s.plataforma.nombre);
      if (s?.plataforma?.dominio) this.dominio.set(s.plataforma.dominio);
    }));

    this.subs.add(this.sitio.planes().subscribe({
      next: d => {
        this.planes.set(d?.planes ?? []);
        this.modulos.set(d?.modulos ?? []);
        this.moneda = d?.moneda || 'COP';
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

    if (campo.value !== limpio) campo.value = limpio;

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
    if (plan.precio_mensual == null) return '';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: this.moneda, maximumFractionDigits: 0 }).format(plan.precio_mensual);
  }

  clientes(plan: Plan): string {
    return plan.clientes ? `Hasta ${plan.clientes.toLocaleString('es-CO')} clientes` : 'Clientes sin tope';
  }

  ir(evento: Event, id: string): void {
    evento.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
