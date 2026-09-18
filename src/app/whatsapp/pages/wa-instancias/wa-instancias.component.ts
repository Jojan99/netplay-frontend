import { ToastService } from '../../../services/toast.service';
import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WhatsappService } from '../../services/whatsapp.service';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-wa-instancias',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-instancias.component.html',
  styleUrl: './wa-instancias.component.scss',
  host: { class: 'np-console' },
})
export class WaInstanciasComponent implements OnInit, OnDestroy {
  private toast = inject(ToastService);

  instances: any[]    = [];
  loading             = false;
  apiError            = '';

  // Crear
  showCreate          = false;
  newName             = '';
  creating            = false;
  createError         = '';

  // QR
  qrInstance: any     = null;
  qrImageUrl          = '';
  qrError             = false;
  private pollSub?:     Subscription;

  // Eliminar
  deleteInstance: any = null;
  deleting            = false;

  /* ── Línea principal ─────────────────────────────────────────
   *
   * La empresa puede tener varias líneas vinculadas. La principal es la que
   * usan las facturas, los avisos y todo lo que no cuelga de una conversación
   * del CRM; los chats responden siempre por la línea por la que entraron.
   */
  marcando: string | null = null;

  /** Catálogo de Laravel, por instance_id: dice cuál es la principal. */
  private lineasPorInstancia: Record<string, any> = {};

  constructor(private wa: WhatsappService) {}

  ngOnInit(): void {
    this.wa.ensureApiKey().subscribe({
      next: () => this.load(),
      error: (e: any) => { this.apiError = this.resolveAuthError(e); }
    });
  }
  ngOnDestroy(): void { this.pollSub?.unsubscribe(); }

  load(): void {
    this.loading  = true;
    this.apiError = '';
    this.wa.getInstances().subscribe({
      next: (r: any) => { this.instances = r.instances || []; this.loading = false; this.loadLineas(); },
      error: (e: any) => { this.loading = false; this.apiError = this.resolveAuthError(e); }
    });
  }

  /**
   * El catálogo de Laravel se sincroniza solo al pedirlo, así que esta llamada
   * también es la que da de alta las líneas nuevas para el CRM.
   */
  loadLineas(): void {
    this.wa.getLineas().subscribe({
      next: (r: any) => {
        const lineas = r?.data ?? [];
        this.lineasPorInstancia = {};
        for (const l of lineas) this.lineasPorInstancia[l.instance_id] = l;
        this.marcarPrincipales();
      },
      // Sin catálogo todavía (migración sin correr): la pantalla anda igual,
      // solo que sin la columna de línea principal.
      error: () => { this.lineasPorInstancia = {}; this.marcarPrincipales(); },
    });
  }

  /** Se precalcula sobre cada fila: un getter en *ngFor congela la pestaña. */
  private marcarPrincipales(): void {
    this.instances = this.instances.map(i => ({
      ...i,
      principal: !!this.lineasPorInstancia[i.instanceId]?.principal,
      lineaId:   this.lineasPorInstancia[i.instanceId]?.id ?? null,
    }));
    this.hayCatalogo = Object.keys(this.lineasPorInstancia).length > 0;
  }

  /** Si Laravel ya tiene el catálogo (si no, no se ofrece cambiar la principal). */
  hayCatalogo = false;

  marcarPrincipal(inst: any): void {
    if (!inst?.lineaId || inst.principal || this.marcando) return;
    this.marcando = inst.instanceId;
    this.wa.setLineaPrincipal(inst.lineaId).subscribe({
      next: () => { this.marcando = null; this.loadLineas(); this.toast.success(`"${inst.name}" es ahora la línea principal.`); },
      error: (e: any) => { this.marcando = null; this.toast.error(e.error?.message || 'No se pudo cambiar la línea principal.'); },
    });
  }

  private resolveAuthError(e: any): string {
    if (e.status === 401) return 'No autorizado: falta la API key. Configura tus credenciales de WhatsApp.';
    if (e.status === 403) return 'Acceso denegado: API key inválida o empresa suspendida.';
    return e.error?.message || 'Error al cargar las instancias.';
  }

  // ── Crear ────────────────────────────────────────────────────
  create(): void {
    if (!this.newName.trim()) return;
    this.creating    = true;
    this.createError = '';
    this.wa.createInstance(this.newName.trim()).subscribe({
      next: () => {
        this.creating   = false;
        this.showCreate = false;
        this.newName    = '';
        this.load();
      },
      error: (e: any) => {
        this.creating    = false;
        if (e.status === 401) this.createError = 'No autorizado: falta la API key.';
        else if (e.status === 403) this.createError = 'Acceso denegado: API key inválida o empresa suspendida.';
        else this.createError = e.error?.message || 'Error al crear';
      }
    });
  }

  cancelCreate(): void {
    this.showCreate  = false;
    this.newName     = '';
    this.createError = '';
  }

  // ── QR ───────────────────────────────────────────────────────
  openQR(inst: any): void {
    this.qrInstance = inst;
    this.qrError    = false;
    this.refreshQrImage();
    this.pollSub?.unsubscribe();
    this.pollSub = interval(5000).subscribe(() => {
      this.wa.getInstanceStatus(inst.instanceId).subscribe({
        next: (s: any) => {
          if (s.status === 'connected') { this.closeQR(); this.load(); }
        }
      });
    });
  }

  refreshQrImage(): void {
    if (!this.qrInstance) return;
    this.qrError    = false;
    this.qrImageUrl = this.wa.getQrUrl(this.qrInstance.instanceId) + `?t=${Date.now()}`;
  }

  closeQR(): void {
    this.qrInstance = null;
    this.qrImageUrl = '';
    this.pollSub?.unsubscribe();
  }

  // ── Actualizar estado ────────────────────────────────────────
  refreshStatus(inst: any): void {
    this.wa.getInstanceStatus(inst.instanceId).subscribe({
      next: (r: any) => {
        const found = this.instances.find(i => i.instanceId === inst.instanceId);
        if (found) {
          found.status   = r.status;
          found.hasQR    = r.hasQR;
          found.phone    = r.phone;
          found.userName = r.userName;
        }
      }
    });
  }

  // ── Eliminar ─────────────────────────────────────────────────
  confirmDelete(inst: any): void {
    this.deleteInstance = inst;
  }

  cancelDelete(): void {
    this.deleteInstance = null;
  }

  doDelete(): void {
    if (!this.deleteInstance) return;
    this.deleting = true;
    this.wa.deleteInstance(this.deleteInstance.instanceId).subscribe({
      next: () => {
        this.deleting       = false;
        this.deleteInstance = null;
        this.load();
      },
      error: (e: any) => {
        this.deleting = false;
        this.toast.error(e.error?.message || 'Error al eliminar');
      }
    });
  }

  trackByInstanceId(i: number, inst: any): string { return inst?.instanceId ?? String(i); }

  get connectedCount(): number {
    return this.instances.filter(i => i.status === 'connected').length;
  }
}