import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { forkJoin, interval, Subscription, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CompanyWhatsappService } from '../../../services/company-whatsapp.service';

@Component({
  selector: 'app-wa-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-panel.component.html',
  styleUrl: './wa-panel.component.scss',
})
export class WaPanelComponent implements OnInit, OnDestroy {

  loading          = true;
  hasCredentials   = true;
  whatsappEnabled  = false;
  activeInstanceId: string | null = null;
  instances: any[] = [];
  instancesError   = false;

  // ── Create ───────────────────────────────────────────────────────────────────
  newInstanceName = '';
  creating        = false;
  createError     = '';

  // ── QR ───────────────────────────────────────────────────────────────────────
  qrInstance:  any    = null;
  qrObjectUrl: string = '';
  qrLoading    = false;
  qrError      = false;
  qrStatus: { connected: boolean; phone?: string } | null = null;
  private pollSub?: Subscription;

  // ── Delete ───────────────────────────────────────────────────────────────────
  instanceToDelete: any = null;
  deleting = false;

  // ── Suscripción ──────────────────────────────────────────────────────────────
  subscribing       = false;
  subscribeMsg      = '';
  subscribeError    = false;
  subscriptionStatus: string | null = null;   // 'active' | 'expired' | 'inactive' | null
  subscriptionPlan: string | null = null;

  // ── Plan requests (admin view) ────────────────────────────────────────────────
  planRequests:   any[] = [];
  loadingReqs     = false;
  showReqsPanel   = false;
  resolvingReqId: number | null = null;

  get pendingRequestsCount(): number {
    return this.planRequests.filter(r => r.status === 'pending').length;
  }

  constructor(private cwaSvc: CompanyWhatsappService) {}

  ngOnInit(): void  { this.loadConfig(); }
  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    if (this.qrObjectUrl) URL.revokeObjectURL(this.qrObjectUrl);
  }

  // ── Config ───────────────────────────────────────────────────────────────────

  loadConfig(): void {
    this.loading = true;

    forkJoin({
      config:    this.cwaSvc.getConfig(),
      instances: this.cwaSvc.getInstances().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ config, instances }) => {
        const d              = config.data ?? config;
        this.hasCredentials  = d.has_credentials  ?? true;
        this.whatsappEnabled = d.whatsapp_enabled  ?? false;
        this.activeInstanceId = d.wa_instance_id   ?? null;
        this.subscriptionStatus = d.subscription?.status ?? null;
        this.subscriptionPlan   = d.subscription?.plan   ?? null;

        if (instances === null) {
          // El servicio WA no respondió — mostrar error pero no ocultar el panel
          this.instancesError = true;
          // Si hay una instancia activa configurada, sintetizarla en la lista
          if (this.activeInstanceId) {
            this.instances = [{ id: this.activeInstanceId, name: 'Instancia configurada', connected: null }];
          } else {
            this.instances = [];
          }
        } else {
          this.instancesError = false;
          const inst = instances.data ?? instances;
          this.instances = Array.isArray(inst) ? inst : [];
        }
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  toggleGlobal(): void {
    this.cwaSvc.updateConfig({ whatsapp_enabled: this.whatsappEnabled }).subscribe({
      error: () => {
        this.whatsappEnabled = !this.whatsappEnabled;
        alert('Error al actualizar la configuración.');
      },
    });
  }

  // ── Create instance ───────────────────────────────────────────────────────────

  openCreateModal(): void {
    this.newInstanceName = '';
    this.createError     = '';
    document.getElementById('create-inst-modal')?.classList.remove('hidden');
  }

  closeCreateModal(): void {
    document.getElementById('create-inst-modal')?.classList.add('hidden');
  }

  createInstance(): void {
    if (!this.newInstanceName.trim()) return;
    this.creating    = true;
    this.createError = '';
    this.cwaSvc.createInstance(this.newInstanceName.trim()).subscribe({
      next: (r: any) => {
        this.creating = false;
        this.closeCreateModal();
        const inst = r.data ?? r;
        // Recargar instancias y abrir QR si tenemos instanceId
        this.cwaSvc.getInstances().subscribe({
          next: (res: any) => {
            const list = res.data ?? res;
            this.instances = Array.isArray(list) ? list : [];
            const created = this.instances.find(
              (i: any) => (i.id ?? i.instanceId) === (inst.instanceId ?? inst.id)
            ) ?? inst;
            if (created?.instanceId || created?.id) {
              setTimeout(() => this.openQrModal(created), 400);
            }
          },
        });
        // Asignar como activa si no hay ninguna
        if (!this.activeInstanceId && (inst.instanceId ?? inst.id)) {
          this.activeInstanceId = inst.instanceId ?? inst.id;
        }
      },
      error: (e: any) => {
        this.creating = false;
        const msg: string = e.error?.message ?? e.message ?? '';
        this.createError = /límite|limite|suscripción|suscripcion/i.test(msg)
          ? 'Has alcanzado el límite de instancias de tu suscripción.'
          : (msg || 'Error al crear la instancia.');
      },
    });
  }

  // ── QR modal ──────────────────────────────────────────────────────────────────

  openQrModal(inst: any): void {
    this.qrInstance = inst;
    this.qrStatus   = null;
    this.qrError    = false;
    document.getElementById('qr-modal')?.classList.remove('hidden');
    this.refreshQr();
    this.startPolling();
  }

  refreshQr(): void {
    if (!this.qrInstance) return;
    this.qrLoading = true;
    this.qrError   = false;
    if (this.qrObjectUrl) { URL.revokeObjectURL(this.qrObjectUrl); this.qrObjectUrl = ''; }
    const id = this.qrInstance.id ?? this.qrInstance.instanceId;
    this.cwaSvc.getQrBlob(id).subscribe({
      next: (blob: Blob) => {
        // Si la respuesta es JSON (error del backend) blob.type será application/json
        if (blob.type === 'application/json') {
          this.qrLoading = false;
          this.qrError   = true;
          return;
        }
        this.qrObjectUrl = URL.createObjectURL(blob);
        this.qrLoading = false;
      },
      error: () => { this.qrLoading = false; this.qrError = true; },
    });
  }

  checkStatus(): void {
    const id = this.qrInstance?.id ?? this.qrInstance?.instanceId;
    if (!id) return;
    this.cwaSvc.getInstanceStatus(id).subscribe({
      next: (r: any) => {
        const d      = r.data ?? r;
        const status = d.status;
        const phone  = d.phone ?? d.userName;
        if (status === 'connected') {
          this.qrStatus = { connected: true, phone };
          this.stopPolling();
          // Actualizar el estado de la instancia en la tabla
          const idx = this.instances.findIndex((i: any) => (i.id ?? i.instanceId) === id);
          if (idx >= 0) this.instances[idx] = { ...this.instances[idx], connected: true, phone };
          setTimeout(() => { this.closeQrModal(); }, 1500);
        }
      },
    });
  }

  startPolling(): void {
    this.stopPolling();
    this.pollSub = interval(4000).subscribe(() => this.checkStatus());
  }

  stopPolling(): void { this.pollSub?.unsubscribe(); }

  closeQrModal(): void {
    this.stopPolling();
    if (this.qrObjectUrl) { URL.revokeObjectURL(this.qrObjectUrl); this.qrObjectUrl = ''; }
    this.qrInstance = null;
    this.qrStatus   = null;
    this.qrError    = false;
    document.getElementById('qr-modal')?.classList.add('hidden');
  }

  // ── Set active ────────────────────────────────────────────────────────────────

  setActive(inst: any): void {
    const id = inst.id ?? inst.instanceId;
    this.cwaSvc.updateConfig({ wa_instance_id: id }).subscribe({
      next: () => { this.activeInstanceId = id; },
      error: () => { alert('Error al establecer la instancia activa.'); },
    });
  }

  isActive(inst: any): boolean {
    return (inst.id ?? inst.instanceId) === this.activeInstanceId;
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  confirmDelete(inst: any): void {
    this.instanceToDelete = inst;
    document.getElementById('delete-inst-modal')?.classList.remove('hidden');
  }

  cancelDelete(): void {
    this.instanceToDelete = null;
    document.getElementById('delete-inst-modal')?.classList.add('hidden');
  }

  doDelete(): void {
    if (!this.instanceToDelete) return;
    this.deleting = true;
    const id       = this.instanceToDelete.id ?? this.instanceToDelete.instanceId;
    const wasActive = id === this.activeInstanceId;
    this.cwaSvc.deleteInstance(id).subscribe({
      next: () => {
        if (wasActive) {
          this.cwaSvc.updateConfig({ wa_instance_id: null }).subscribe();
          this.activeInstanceId = null;
        }
        this.instances = this.instances.filter((i: any) => (i.id ?? i.instanceId) !== id);
        this.deleting = false;
        this.cancelDelete();
      },
      error: (e: any) => {
        this.deleting = false;
        alert(e.error?.message ?? 'Error al eliminar la instancia.');
      },
    });
  }

  canShowQr(inst: any): boolean {
    return !(inst.connected || inst.status === 'connected');
  }

  // ── Suscripción ──────────────────────────────────────────────────────────────

  toggleReqsPanel(): void {
    this.showReqsPanel = !this.showReqsPanel;
    if (this.showReqsPanel) this.loadPlanRequests();
  }

  loadPlanRequests(): void {
    this.loadingReqs = true;
    this.cwaSvc.listPlanRequests().subscribe({
      next: (r: any) => { this.planRequests = r.data ?? []; this.loadingReqs = false; },
      error: () => { this.loadingReqs = false; },
    });
  }

  resolveRequest(req: any, action: 'approve' | 'reject'): void {
    this.resolvingReqId = req.id;
    this.cwaSvc.resolvePlanRequest(req.id, action).subscribe({
      next: () => {
        this.resolvingReqId = null;
        req.status = action === 'approve' ? 'approved' : 'rejected';
        if (action === 'approve') setTimeout(() => this.loadConfig(), 800);
      },
      error: (e: any) => {
        this.resolvingReqId = null;
        alert(e.error?.message ?? 'Error al procesar la solicitud.');
      },
    });
  }

  get subscriptionActive(): boolean {
    return this.subscriptionStatus === 'active';
  }

  activateSubscription(): void {
    this.subscribing    = true;
    this.subscribeMsg   = '';
    this.subscribeError = false;
    this.cwaSvc.subscribeWhatsApp().subscribe({
      next: (r: any) => {
        this.subscribing    = false;
        const d             = r.data ?? r;
        const expiresAt     = d.expiresAt ?? d.expires_at;
        this.subscribeMsg   = expiresAt
          ? `Plan activado hasta ${new Date(expiresAt).toLocaleDateString('es-CO')}.`
          : 'Plan activado correctamente.';
        this.subscribeError = false;
        // Recargar config para reflejar el estado real desde WA service
        setTimeout(() => this.loadConfig(), 800);
      },
      error: (e: any) => {
        this.subscribing    = false;
        this.subscribeMsg   = e.error?.message ?? 'Error al activar la suscripción.';
        this.subscribeError = true;
      },
    });
  }
}
