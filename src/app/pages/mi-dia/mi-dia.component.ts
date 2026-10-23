import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { InstallationService } from '../../services/installation.service';
import { UserService } from '../../services/user.service';
import { InventoryService } from '../../services/inventory.service';
import { SeccionTabsComponent } from '../../components/seccion-tabs/seccion-tabs.component';

type Visita = {
  tipo: 'instalacion' | 'ticket';
  id: number;
  hora: string | null;
  cliente: string;
  etiqueta: string;
  tono: 'curso' | 'info' | 'mal' | 'warn';
  detalle: string;
  direccion: string;
  telefono: string;
  enCurso: boolean;
  accion: string;
  ruta: string;
  query: Record<string, number | undefined>;
};

/**
 * Mi día (21-10-2026): la agenda de hoy en el celular del técnico —sus instalaciones y sus
 * tickets abiertos, en orden— con lo que se hace parado en la calle: cómo llegar, escribirle
 * al cliente y abrir la orden o el ticket. Al técnico el servidor ya le filtra lo suyo; a la
 * oficina le muestra la agenda de todos.
 */
@Component({
  selector: 'app-mi-dia',
  standalone: true,
  imports: [CommonModule, RouterLink, SeccionTabsComponent],
  templateUrl: './mi-dia.component.html',
  styleUrls: ['./mi-dia.component.scss'],
})
export class MiDiaComponent implements OnInit {
  private auth = inject(AuthService);
  private instalaciones = inject(InstallationService);
  private usuarios = inject(UserService);
  private bodega = inject(InventoryService);

  cargando = true;
  visitas: Visita[] = [];
  equipos = 0;
  readonly esTecnico = this.auth.isTecnico();
  readonly nombre = (this.auth.getNombre() || '').trim().split(/\s+/)[0] || '';
  readonly hoy = new Date();

  ngOnInit(): void { this.cargar(); }

  private fecha(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  cargar(): void {
    this.cargando = true;
    const hoy = this.fecha(new Date());
    forkJoin({
      inst: this.instalaciones.getAll({ per_page: 200 } as any).pipe(catchError(() => of(null))),
      tick: this.usuarios.getAllTickets({ per_page: 100 }).pipe(catchError(() => of(null))),
      mat: this.esTecnico ? this.bodega.miMaterial().pipe(catchError(() => of(null))) : of(null),
    }).subscribe(({ inst, tick, mat }: any) => {
      const ordenes: any[] = Array.isArray(inst) ? inst : (inst?.data ?? []);
      const tickets: any[] = tick?.data?.items ?? [];
      this.equipos = Number(mat?.data?.equipos_total ?? 0);

      const deHoy = ordenes.filter(o => !['completed', 'cancelled'].includes(o.status)
        && (o.status === 'in_progress' || String(o.scheduled_date ?? '').slice(0, 10) <= hoy));
      const visitasI: Visita[] = deHoy.map(o => ({
        tipo: 'instalacion', id: o.id, hora: o.scheduled_time ? String(o.scheduled_time).slice(0, 5) : null,
        cliente: o.client_name || 'Sin nombre',
        etiqueta: o.status === 'in_progress' ? 'Instalación · en curso' : (String(o.scheduled_date ?? '').slice(0, 10) < hoy ? 'Instalación · atrasada' : 'Instalación'),
        tono: o.status === 'in_progress' ? 'curso' : (String(o.scheduled_date ?? '').slice(0, 10) < hoy ? 'mal' : 'info'),
        detalle: ['pending', 'rejected'].includes(o.payment_status) && Number(o.installation_cost) > 0
          ? `Cobrar la instalación: $ ${Math.round(Number(o.installation_cost)).toLocaleString('es-CO')}` : (o.observations || ''),
        direccion: [o.address, o.neighborhood].filter(Boolean).join(' · '), telefono: o.client_phone || '',
        enCurso: o.status === 'in_progress',
        accion: ['confirmed', 'in_progress'].includes(o.status) ? 'Instalar el equipo' : 'Abrir la orden',
        ruta: '/dashboard/installations', query: ['confirmed', 'in_progress'].includes(o.status) ? { orden: o.id, instalar: 1 } : { orden: o.id },
      }));
      const visitasT: Visita[] = tickets.filter(t => Number(t.status_id) !== 3).map(t => ({
        tipo: 'ticket', id: t.id, hora: null,
        cliente: `${t.user_names ?? ''} ${t.user_lastname ?? ''}`.trim() || 'Sin nombre',
        etiqueta: `Ticket · ${String(t.service ?? 'soporte').toLowerCase()}`,
        tono: Number(t.status_id) === 2 ? 'curso' : 'warn',
        detalle: t.observation || '', direccion: t.address || '', telefono: t.phone || '',
        enCurso: Number(t.status_id) === 2, accion: 'Abrir el ticket',
        ruta: '/dashboard/view-ticket', query: { ticket: t.id },
      }));

      // Primero lo que está en curso; después las instalaciones por hora y al final los tickets.
      this.visitas = [...visitasI, ...visitasT].sort((a, b) =>
        Number(b.enCurso) - Number(a.enCurso)
        || (a.tipo === b.tipo ? (a.hora ?? '99').localeCompare(b.hora ?? '99') : (a.tipo === 'instalacion' ? -1 : 1)));
      this.cargando = false;
    });
  }

  get instalacionesHoy(): number { return this.visitas.filter(v => v.tipo === 'instalacion').length; }
  get ticketsHoy(): number { return this.visitas.filter(v => v.tipo === 'ticket').length; }

  mapa(v: Visita): string {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(v.direccion);
  }

  whatsapp(v: Visita): string {
    const d = v.telefono.replace(/\D/g, '');
    return 'https://wa.me/' + (d.length === 10 ? '57' + d : d);
  }
}
