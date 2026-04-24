import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ContractService } from '../../services/contract.service';
import { UserService } from '../../services/user.service';

interface Contract {
  id: number;
  title: string;
  content: string;
  active: boolean;
  created_at: string;
}

interface ClientContract {
  id: number;
  status: 'pending' | 'signed';
  token: string;
  signed_at: string | null;
  contract: { id: number; title: string };
  user: { id: number; username: string; names?: string; lastname?: string; phone?: string; email?: string; dni?: string };
}

interface Client {
  id: number;
  names: string;
  lastname: string;
  dni: string;
  phone: string;
  email: string;
}

type Tab = 'templates' | 'assigned';

@Component({
  selector: 'app-contracts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './contracts.component.html',
})
export class ContractsComponent implements OnInit {

  activeTab: Tab = 'templates';

  // ── Plantillas ────────────────────────────────────────────────────────────
  contracts: Contract[]      = [];
  isLoading                  = false;
  showTemplateModal          = false;
  isEditing                  = false;
  isSaving                   = false;
  templateForm               = { id: 0, title: '', content: '', active: true };
  deleteConfirmId: number | null = null;
  isDeleting                 = false;

  // ── Asignación ────────────────────────────────────────────────────────────
  assignedContracts: ClientContract[] = [];
  isLoadingAssigned                   = false;
  showAssignModal                     = false;
  isAssigning                         = false;
  clientSearch                        = '';
  clientResults: Client[]             = [];
  isSearching                         = false;
  selectedClient: Client | null       = null;
  selectedContractId                  = 0;

  // ── Filtro asignados ─────────────────────────────────────────────────────
  assignedSearch = '';

  get filteredAssigned(): ClientContract[] {
    const q = this.assignedSearch.trim().toLowerCase();
    if (!q) return this.assignedContracts;
    return this.assignedContracts.filter(cc =>
      cc.user.names?.toLowerCase().includes(q)      ||
      cc.user.lastname?.toLowerCase().includes(q)   ||
      cc.user.dni?.toLowerCase().includes(q)        ||
      cc.user.username?.toLowerCase().includes(q)   ||
      cc.contract.title.toLowerCase().includes(q)
    );
  }

  // ── Eliminar contrato asignado ────────────────────────────────────────────
  deleteClientContractId: number | null = null;
  isDeletingAssigned                    = false;

  // ── Envío de link ─────────────────────────────────────────────────────────
  showSendModal: ClientContract | null = null;
  phoneInput                           = '';
  emailInput                           = '';
  isSendingWa                          = false;
  isSendingEmail                       = false;
  copiedId: number | null              = null;

  // ── Feedback ──────────────────────────────────────────────────────────────
  successMsg = '';
  errorMsg   = '';

  constructor(
    private contractService: ContractService,
    private userService: UserService,
  ) {}

  ngOnInit(): void {
    this.loadContracts();
    this.loadAssigned();
  }

  // ── Plantillas ────────────────────────────────────────────────────────────

  loadContracts(): void {
    this.isLoading = true;
    this.contractService.getAll().subscribe({
      next:  r => { this.isLoading = false; this.contracts = r.data ?? []; },
      error: () => { this.isLoading = false; },
    });
  }

  openCreate(): void {
    this.isEditing     = false;
    this.templateForm  = { id: 0, title: '', content: '', active: true };
    this.errorMsg      = '';
    this.showTemplateModal = true;
  }

  openEdit(c: Contract): void {
    this.isEditing    = true;
    this.templateForm = { id: c.id, title: c.title, content: c.content, active: c.active };
    this.errorMsg     = '';
    this.showTemplateModal = true;
  }

  saveTemplate(): void {
    this.isSaving = true;
    this.errorMsg = '';
    const obs = this.isEditing
      ? this.contractService.update(this.templateForm.id, this.templateForm)
      : this.contractService.create(this.templateForm);

    obs.subscribe({
      next: r => {
        this.isSaving = false;
        if (r.status === 0) {
          this.showTemplateModal = false;
          this.toast(this.isEditing ? 'Contrato actualizado.' : 'Contrato creado.');
          this.loadContracts();
        } else {
          this.errorMsg = r.message;
        }
      },
      error: () => { this.isSaving = false; this.errorMsg = 'Error al guardar.'; },
    });
  }

  confirmDelete(id: number): void { this.deleteConfirmId = id; }
  cancelDelete(): void            { this.deleteConfirmId = null; }

  deleteContract(): void {
    if (!this.deleteConfirmId) return;
    this.isDeleting = true;
    this.contractService.delete(this.deleteConfirmId).subscribe({
      next: () => {
        this.isDeleting      = false;
        this.deleteConfirmId = null;
        this.toast('Contrato eliminado.');
        this.loadContracts();
      },
      error: () => { this.isDeleting = false; },
    });
  }

  // ── Asignados ─────────────────────────────────────────────────────────────

  loadAssigned(): void {
    this.isLoadingAssigned = true;
    // Carga los contratos asignados de todos los clientes activos
    // El backend filtra por company_id del JWT
    this.contractService.getByUser(0).subscribe({
      next:  r => { this.isLoadingAssigned = false; this.assignedContracts = r.data ?? []; },
      error: () => { this.isLoadingAssigned = false; },
    });
  }

  openAssign(): void {
    this.clientSearch      = '';
    this.clientResults     = [];
    this.selectedClient    = null;
    this.selectedContractId = this.contracts[0]?.id ?? 0;
    this.errorMsg          = '';
    this.showAssignModal   = true;
  }

  searchClients(): void {
    if (this.clientSearch.length < 2) return;
    this.isSearching = true;
    this.userService.searchClients(this.clientSearch).subscribe({
      next:  r => { this.isSearching = false; this.clientResults = r.data ?? []; },
      error: () => { this.isSearching = false; },
    });
  }

  selectClient(c: Client): void {
    this.selectedClient  = c;
    this.clientResults   = [];
    this.clientSearch    = `${c.names} ${c.lastname}`;
  }

  assign(): void {
    if (!this.selectedClient || !this.selectedContractId) return;
    this.isAssigning = true;
    this.contractService.assign(this.selectedContractId, this.selectedClient.id).subscribe({
      next: r => {
        this.isAssigning     = false;
        this.showAssignModal = false;
        this.toast('Contrato asignado. Ya puede enviarle el link al cliente.');
        this.loadAssigned();
      },
      error: () => { this.isAssigning = false; this.errorMsg = 'Error al asignar.'; },
    });
  }

  // ── Link de firma ─────────────────────────────────────────────────────────

  getSignUrl(token: string): string {
    return this.contractService.getSignUrl(token);
  }

  copyLink(cc: ClientContract): void {
    navigator.clipboard.writeText(this.getSignUrl(cc.token));
    this.copiedId = cc.id;
    setTimeout(() => { this.copiedId = null; }, 2000);
  }

  openSend(cc: ClientContract): void {
    this.showSendModal = cc;
    this.phoneInput    = cc.user.phone  ?? '';
    this.emailInput    = cc.user.email  ?? '';
  }

  closeSend(): void { this.showSendModal = null; }

  sendWhatsApp(): void {
    if (!this.showSendModal || !this.phoneInput) return;
    this.isSendingWa = true;
    this.contractService.sendByWhatsApp(this.showSendModal.id, this.phoneInput).subscribe({
      next: () => {
        this.isSendingWa   = false;
        this.showSendModal = null;
        this.toast('Mensaje enviado por WhatsApp.');
      },
      error: () => { this.isSendingWa = false; },
    });
  }

  sendMail(): void {
    if (!this.showSendModal || !this.emailInput) return;
    this.isSendingEmail = true;
    this.contractService.sendByEmail(this.showSendModal.id, this.emailInput).subscribe({
      next: () => {
        this.isSendingEmail = false;
        this.showSendModal  = null;
        this.toast('Correo enviado exitosamente.');
      },
      error: () => { this.isSendingEmail = false; },
    });
  }

  confirmDeleteAssigned(id: number): void  { this.deleteClientContractId = id; }
  cancelDeleteAssigned(): void             { this.deleteClientContractId = null; }

  deleteAssignedContract(): void {
    if (!this.deleteClientContractId) return;
    this.isDeletingAssigned = true;
    this.contractService.deleteClientContract(this.deleteClientContractId).subscribe({
      next: () => {
        this.isDeletingAssigned       = false;
        this.deleteClientContractId   = null;
        this.toast('Contrato eliminado del cliente.');
        this.loadAssigned();
      },
      error: () => { this.isDeletingAssigned = false; },
    });
  }

  downloadPdf(cc: ClientContract): void {
    this.contractService.downloadPdf(cc.id).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `contrato-${cc.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  statusBadge(status: string): string {
    return status === 'signed'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
  }
}
