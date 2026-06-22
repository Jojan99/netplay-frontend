import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { UserService } from '../../../services/user.service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { GenericInterface } from '../../../models/generic-interface';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-maintenance-ticket',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './maintenance-ticket.component.html',
  styleUrls: ['./maintenance-ticket.component.scss']
})
export class MaintenanceTicketComponent implements OnInit {

  ticketForm: FormGroup;
  isLoading = false;

  // Catalogs
  ServiceTicket: GenericInterface[]  = [];
  PriorityTicket: GenericInterface[] = [];
  UserInterfacesTecni: any[]         = [];

  // User search
  allUsers: any[]      = [];
  filteredUsers: any[] = [];
  searchText  = '';
  showList    = false;

  // Selected user data
  selectedUser: any = null;

  // Steps
  currentStep = 1; // 1 = Buscar cliente, 2 = Datos del ticket

  constructor(
    private fb: FormBuilder,
    private userService: UserService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.ticketForm = this.fb.group({
      date:         [new Date().toISOString().substring(0, 10), Validators.required],
      type_service: [0, [Validators.required, Validators.min(1)]],
      priority:     [0, [Validators.required, Validators.min(1)]],
      tecnichal:    [0, [Validators.required, Validators.min(1)]],
      observation:  ['', Validators.required],
    });
  }

  ngOnInit() {
    this.loadCatalogs();
    this.loadUsers();
  }

  loadCatalogs() {
    this.userService.getServiceTicket().subscribe({
      next: (res) => {
        this.ServiceTicket = (res.data || []).map((e: any) => ({ id: e.id, names: e.name }));
      }
    });
    this.userService.getPriorityTicket().subscribe({
      next: (res) => {
        this.PriorityTicket = (res.data || []).map((e: any) => ({ id: e.id, names: e.name }));
      }
    });
    this.userService.getTechnicaAll().subscribe({
      next: (res) => {
        this.UserInterfacesTecni = (res.data || []).map((e: any) => ({
          id_user: e.user_id,
          names:   e.names,
          lastname: e.lastname,
        }));
      }
    });
  }

  loadUsers() {
    this.isLoading = true;
    this.userService.getAllUser().subscribe({
      next: (res) => {
        this.allUsers      = (res.data || []).map((e: any) => ({
          id_user:  e.id,
          names:    e.names,
          lastname: e.lastname,
          address:  e.address,
          dni:      e.dni,
          phone:    e.phone,
        }));
        this.filteredUsers = [...this.allUsers];
        this.isLoading     = false;
      },
      error: () => { this.isLoading = false; }
    });
  }

  onSearch(event: any) {
    const q = event.target.value.toLowerCase();
    this.filteredUsers = this.allUsers.filter(u =>
      u.names.toLowerCase().includes(q) ||
      u.lastname.toLowerCase().includes(q) ||
      (u.dni || '').toLowerCase().includes(q)
    );
  }

  selectUser(user: any) {
    this.selectedUser = user;
    this.searchText   = `${user.names} ${user.lastname}`;
    this.showList     = false;
    this.currentStep  = 2;
  }

  clearUser() {
    this.selectedUser = null;
    this.searchText   = '';
    this.currentStep  = 1;
    this.ticketForm.reset({
      date:         new Date().toISOString().substring(0, 10),
      type_service: 0,
      priority:     0,
      tecnichal:    0,
      observation:  '',
    });
  }

  getTechnicianName(): string {
    const techId = this.ticketForm.value.tecnichal;
    const tech   = this.UserInterfacesTecni.find(t => t.id_user == techId);
    return tech ? `${tech.names} ${tech.lastname}` : '';
  }

  submit() {
    if (this.ticketForm.invalid || !this.selectedUser) {
      this.ticketForm.markAllAsTouched();
      if (!this.selectedUser) alert('Debe seleccionar un cliente');
      return;
    }

    this.isLoading = true;

    const payload = {
      user_id:          this.selectedUser.id_user,
      address:          this.selectedUser.address,
      cedula:           this.selectedUser.dni,
      phone:            this.selectedUser.phone,
      date:             this.ticketForm.value.date,
      type_service:     this.ticketForm.value.type_service,
      priority:         this.ticketForm.value.priority,
      tecnichal:        this.ticketForm.value.tecnichal,
      observation:      this.ticketForm.value.observation,
      client_name:      `${this.selectedUser.names} ${this.selectedUser.lastname}`,
      technician_name:  this.getTechnicianName(),
    };

    this.userService.createdTicket(payload).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (!res.error) {
          this.router.navigate(['dashboard/view-ticket']);
        }
      },
      error: () => { this.isLoading = false; }
    });
  }

  cancel() {
    this.router.navigate(['dashboard/view-ticket']);
  }

  isInvalid(field: string): boolean {
    const ctrl = this.ticketForm.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }

  // ── Ping ──────────────────────────────────────────────────────────────────
  pingName = '';
  pingDni: any = '';
  pingCount = 5;
  pingResults: Array<{ host: string; time: string; received: string; status: string }> = [];
  showPingModal = false;
  showPingForm = false;
  isPinging = false;
  private pingSubscription: Subscription | null = null;

  openPingModal(name: string, lastname: string, dni: any) {
    this.pingName     = `${name} ${lastname}`;
    this.pingDni      = dni;
    this.pingResults  = [];
    this.showPingForm = false;
    this.showPingModal = true;
    if (this.pingSubscription) { this.pingSubscription.unsubscribe(); this.pingSubscription = null; }
  }

  closePingModal() {
    this.showPingModal = false;
    if (this.pingSubscription) { this.pingSubscription.unsubscribe(); this.pingSubscription = null; }
    this.pingResults  = [];
    this.isPinging    = false;
  }

  startPing() {
    this.pingResults = [];
    this.cdr.detectChanges();
    if (this.pingSubscription) { this.pingSubscription.unsubscribe(); }
    this.isPinging = true;
    this.pingSubscription = this.userService.getPingResults(this.pingCount, this.pingDni).subscribe({
      next: data => {
        if (data.message === 'done') { this.isPinging = false; return; }
        const p = typeof data === 'string' ? JSON.parse(data) : data;
        const status = p['packet-loss'] === '100' ? '❌ Timeout' : p['packet-loss'] === '0' ? '✅ Activo' : '⚠️ Intermitente';
        this.pingResults.push({ ...p, status });
        this.cdr.detectChanges();
      },
      error: () => { this.isPinging = false; },
      complete: () => { this.isPinging = false; }
    });
  }

  convertToSeconds(time: string | undefined): string {
    if (!time) return '❌ Timeout';
    if (time.includes('us')) return (parseFloat(time) / 1_000_000).toFixed(2) + ' s';
    if (time.includes('ms')) return (parseFloat(time) / 1_000).toFixed(2) + ' s';
    return parseFloat(time).toFixed(2) + ' s';
  }
}
