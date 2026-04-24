import { Component, OnInit } from '@angular/core';
import { CommonModule }      from '@angular/common';
import { FormsModule }       from '@angular/forms';
import { CompanyWhatsappService } from '../../../services/company-whatsapp.service';
import { ToastService }           from '../../../services/toast.service';

interface Route {
  id: number;
  event_type: string;
  destination: string;
  label: string;
  enabled: boolean;
}

@Component({
  selector: 'app-wa-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-notifications.component.html',
})
export class WaNotificationsComponent implements OnInit {
  loading  = true;
  routes: Route[] = [];
  eventTypes: Record<string, string> = {};
  groups: { jid: string; name: string; participants: number }[] = [];
  loadingGroups = false;

  // Add form
  addForm = { event_type: '', destination: '', label: '' };
  saving  = false;

  constructor(
    private waService: CompanyWhatsappService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadGroups();
  }

  load(): void {
    this.loading = true;
    this.waService.listNotificationRoutes().subscribe({
      next: (res) => {
        this.routes     = res.data?.routes     ?? [];
        this.eventTypes = res.data?.event_types ?? {};
        this.loading    = false;
        if (!this.addForm.event_type && Object.keys(this.eventTypes).length) {
          this.addForm.event_type = Object.keys(this.eventTypes)[0];
        }
      },
      error: () => { this.loading = false; },
    });
  }

  loadGroups(): void {
    this.loadingGroups = true;
    this.waService.getGroups().subscribe({
      next: (res) => {
        this.groups       = res.data?.groups ?? [];
        this.loadingGroups = false;
      },
      error: () => { this.loadingGroups = false; },
    });
  }

  selectGroup(jid: string, name: string): void {
    this.addForm.destination = jid;
    this.addForm.label       = name;
  }

  addRoute(): void {
    if (!this.addForm.event_type || !this.addForm.destination) return;
    this.saving = true;
    this.waService.createNotificationRoute(this.addForm).subscribe({
      next: (res) => {
        this.saving = false;
        this.routes.push(res.data);
        this.addForm = { event_type: Object.keys(this.eventTypes)[0] ?? '', destination: '', label: '' };
        this.toast.success('Ruta creada');
      },
      error: () => { this.saving = false; this.toast.error('Error al crear ruta'); },
    });
  }

  toggle(r: Route): void {
    const prev = r.enabled;
    r.enabled  = !prev;
    this.waService.updateNotificationRoute(r.id, { enabled: r.enabled }).subscribe({
      error: () => { r.enabled = prev; this.toast.error('Error al actualizar'); },
    });
  }

  delete(r: Route): void {
    this.waService.deleteNotificationRoute(r.id).subscribe({
      next: () => {
        this.routes = this.routes.filter(x => x.id !== r.id);
        this.toast.success('Ruta eliminada');
      },
      error: () => this.toast.error('Error al eliminar'),
    });
  }

  routesByEvent(eventType: string): Route[] {
    return this.routes.filter(r => r.event_type === eventType);
  }

  get eventKeys(): string[] { return Object.keys(this.eventTypes); }

  formatDest(dest: string): string {
    if (dest.includes('@g.us')) return '👥 ' + dest.replace('@g.us', '');
    return '📱 ' + dest.replace('@s.whatsapp.net', '');
  }
}
