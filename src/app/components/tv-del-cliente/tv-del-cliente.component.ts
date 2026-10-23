import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TvService } from '../../services/tv.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

/**
 * La TV del cliente en su ficha (21-10-2026): usuario, clave, servidor y lista M3U para copiar o
 * mandarle por WhatsApp, y lo que se hace con la línea (cambiar clave, apagar, cambiar paquete).
 * Si no tiene línea, se le crea aquí; si su plan lleva TV, ya se creó sola al darlo de alta.
 */
@Component({
  selector: 'app-tv-del-cliente',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './tv-del-cliente.component.html',
  styleUrls: ['./tv-del-cliente.component.scss'],
})
export class TvDelClienteComponent implements OnChanges {
  private tv = inject(TvService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  @Input() userId: number | null = null;

  cargando = true;
  conectado = false;
  linea: any = null;
  planConTv: { bouquets: number[]; pantallas: number } | null = null;
  verClave = false;
  ocupado = '';

  // Formato de la lista: se recuerda en este navegador (cada quien atiende con su decodificador habitual).
  tipo = this.recordado('tv-formato', 'm3u_plus');
  salida = this.recordado('tv-salida', 'ts');

  // Crear o cambiar el paquete
  editando = false;
  bouquets: Array<{ id: number; nombre: string; canales: number }> = [];
  elegidos: number[] = [];
  pantallas = 2;

  ngOnChanges(): void { this.cargar(); }

  cargar(): void {
    if (!this.userId) return;
    this.cargando = true;
    this.editando = false;
    this.verClave = false;
    this.tv.deCliente(this.userId).subscribe({
      next: (r: any) => {
        this.cargando = false;
        const d = r?.data ?? {};
        this.conectado = !!d.conectado;
        this.linea = d.linea ?? null;
        this.planConTv = d.plan_con_tv ?? null;
      },
      // Sin el módulo de TV en el perfil la tarjeta simplemente no aparece.
      error: () => { this.cargando = false; this.conectado = false; },
    });
  }

  get estado(): { texto: string; tono: string } {
    const e = this.linea?.estado;
    if (e === 'activa') return { texto: 'Activa', tono: 'ok' };
    if (e === 'pendiente') return { texto: 'Pendiente de crear', tono: 'warn' };
    if (e === 'suspendida') return { texto: 'Suspendida por mora', tono: 'mal' };
    if (e === 'retirada') return { texto: 'Retirada', tono: 'neutro' };
    return { texto: 'Apagada', tono: 'neutro' };
  }

  async copiar(texto: string, que: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.toast.success(`${que} copiado`);
    } catch {
      this.toast.error('No se pudo copiar: selecciónelo y cópielo a mano.');
    }
  }

  /** La lista en el formato y la salida elegidos, como la arma el XUI. */
  get url(): string {
    const l = this.linea;
    if (!l) return '';
    // El enlace corto del XUI, el que usa la empresa: /playlist/usuario/clave/formato.
    return `${l.servidor}/playlist/${encodeURIComponent(l.usuario)}/${encodeURIComponent(l.clave)}/${this.tipo}` + (this.salida !== 'ts' ? `?output=${this.salida}` : '');
  }

  get urlVisible(): string {
    const l = this.linea;
    return this.verClave || !l ? this.url : this.url.replace(`/${encodeURIComponent(l.usuario)}/${encodeURIComponent(l.clave)}/`, `/${encodeURIComponent(l.usuario)}/••••••••/`);
  }

  get formato(): any { return (this.linea?.formatos ?? []).find((f: any) => f.clave === this.tipo); }

  cambiarFormato(): void {
    try { localStorage.setItem('tv-formato', this.tipo); localStorage.setItem('tv-salida', this.salida); } catch { /* sin almacenamiento: no se recuerda */ }
  }

  private recordado(clave: string, porDefecto: string): string {
    try { return localStorage.getItem(clave) || porDefecto; } catch { return porDefecto; }
  }

  /** Todo junto, como se lo mandaría al cliente. */
  copiarTodo(): void {
    const l = this.linea;
    this.copiar(`Usuario: ${l.usuario}\nClave: ${l.clave}\nServidor: ${l.servidor}\nLista ${this.formato?.nombre ?? ''}: ${this.url}`, 'Datos de la línea');
  }

  private correr(que: string, obs: any, tras?: (d: any) => void): void {
    this.ocupado = que;
    obs.subscribe({
      next: (r: any) => {
        this.ocupado = '';
        if (r?.error) { this.toast.error(r.message ?? 'No se pudo.'); return; }
        this.toast.success(r.message);
        if (r?.data?.usuario) this.linea = r.data;
        tras?.(r?.data);
      },
      error: (e: any) => { this.ocupado = ''; this.toast.error(e?.error?.message ?? 'No se pudo.'); },
    });
  }

  enviar(): void { this.correr('whatsapp', this.tv.whatsapp(this.linea.id, this.tipo, this.salida)); }

  async cambiarClave(): Promise<void> {
    if (!(await this.dialog.confirm('La clave actual deja de funcionar en todos sus aparatos. Después mándele la nueva.', { title: 'Cambiar la clave', okLabel: 'Cambiar' }))) return;
    this.correr('clave', this.tv.cambiarClave(this.linea.id), () => this.verClave = true);
  }

  async encender(prender: boolean): Promise<void> {
    if (!prender && !(await this.dialog.confirm('El cliente deja de ver TV hasta que se vuelva a prender.', { title: 'Apagar la línea', okLabel: 'Apagar', danger: true }))) return;
    this.correr('encender', this.tv.encender(this.linea.id, prender));
  }

  /** Abre el editor de paquete: para crear la línea o para cambiársela. */
  abrirEditor(): void {
    this.editando = true;
    this.elegidos = [...(this.linea?.bouquets ?? this.planConTv?.bouquets ?? [])];
    this.pantallas = this.linea?.pantallas ?? this.planConTv?.pantallas ?? 2;
    if (!this.bouquets.length) {
      this.tv.configuracion().subscribe({
        next: (r: any) => {
          this.bouquets = r?.data?.bouquets ?? [];
          if (!this.elegidos.length) this.elegidos = [...(r?.data?.panel?.bouquets ?? [])];
          if (!this.linea && !this.planConTv) this.pantallas = r?.data?.panel?.pantallas ?? 2;
        },
        error: () => this.toast.error('No se pudieron leer los paquetes del panel.'),
      });
    }
  }

  alternar(id: number): void { this.elegidos = this.elegidos.includes(id) ? this.elegidos.filter(x => x !== id) : [...this.elegidos, id]; }

  guardarEditor(): void {
    if (!this.elegidos.length) { this.toast.error('Elija al menos un paquete.'); return; }
    const n = Math.max(1, Math.min(20, Number(this.pantallas) || 1));
    if (this.linea?.en_el_panel) {
      this.correr('paquete', this.tv.paquete(this.linea.id, this.elegidos, n), () => this.editando = false);
    } else {
      this.correr('crear', this.tv.crearDeCliente(this.userId!, { bouquets: this.elegidos, pantallas: n }), () => { this.editando = false; this.verClave = true; });
    }
  }

  /** Crear de una vez con lo que trae el plan (o lo de la empresa). */
  crearYa(): void {
    this.correr('crear', this.tv.crearDeCliente(this.userId!, {}), () => this.verClave = true);
  }

  hace(fecha: string | null): string {
    if (!fecha) return 'nunca';
    const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
    if (min < 60) return min < 1 ? 'ahora' : `hace ${min} min`;
    const h = Math.round(min / 60);
    return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
  }
}
