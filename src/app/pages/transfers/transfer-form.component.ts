import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { TransferService } from '../../services/transfer.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-transfer-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './transfer-form.component.html',
})
export class TransferFormComponent implements OnInit {
  isLoading = false;
  isSaving = false;
  errorMsg = '';
  successMsg = '';

  clients: any[] = [];
  routers: any[] = [];
  technicians: any[] = [];

  selectedClient: any = null;
  form = this.emptyForm();

  constructor(
    private svc: TransferService,
    private userSvc: UserService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadOptions();
  }

  emptyForm() {
    return {
      user_data_id: '',
      new_address: '',
      new_neighborhood: '',
      new_router_id: '',
      new_ip: '',
      scheduled_date: '',
      scheduled_time: '09:00',
      transfer_cost: '0',
      technician_1_id: '',
      technician_2_id: '',
      commission_amount: '0',
      observations: '',
    };
  }

  loadOptions(): void {
    this.svc.getRouters().subscribe(r => this.routers = r.data || []);
    this.svc.getTechnicians().subscribe(r => this.technicians = r.data || []);
    this.userSvc.getAllUser().subscribe((r: any) => {
      this.clients = r.data || r || [];
    });
  }

  selectClient(c: any): void {
    this.selectedClient = c;
    this.form.user_data_id = c.id?.toString() || '';
    this.form.new_address = c.address || '';
    this.form.new_neighborhood = '';
    this.form.new_ip = c.ip_assignment_id || '';
  }

  clearClient(): void {
    this.selectedClient = null;
    this.form = this.emptyForm();
  }

  onClientChange(event: any): void {
    const clientId = event.target.value;
    if (!clientId) {
      this.clearClient();
      return;
    }
    const client = this.clients.find(c => c.id === parseInt(clientId));
    if (client) {
      this.selectClient(client);
    }
  }

  save(): void {
    if (!this.form.user_data_id || !this.form.new_address || !this.form.scheduled_date) {
      this.errorMsg = 'Por favor complete los campos requeridos';
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';

    const data: any = {
      user_data_id: parseInt(this.form.user_data_id),
      new_address: this.form.new_address,
      new_neighborhood: this.form.new_neighborhood || undefined,
      new_router_id: this.form.new_router_id ? parseInt(this.form.new_router_id) : undefined,
      new_ip: this.form.new_ip || undefined,
      scheduled_date: this.form.scheduled_date,
      scheduled_time: this.form.scheduled_time,
      transfer_cost: this.form.transfer_cost ? parseFloat(this.form.transfer_cost) : 0,
      technician_1_id: this.form.technician_1_id ? parseInt(this.form.technician_1_id) : undefined,
      technician_2_id: this.form.technician_2_id ? parseInt(this.form.technician_2_id) : undefined,
      commission_amount: this.form.commission_amount ? parseFloat(this.form.commission_amount) : 0,
      observations: this.form.observations || undefined,
    };

    this.svc.create(data).subscribe({
      next: r => {
        this.isSaving = false;
        if (r.status === 0 || r.status === undefined) {
          this.toast(r.message || 'Traslado creado');
          this.router.navigate(['/transfers']);
        } else {
          this.errorMsg = r.message || 'Error al crear';
        }
      },
      error: () => {
        this.isSaving = false;
        this.errorMsg = 'Error al crear';
      },
    });
  }

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  get isValid(): boolean {
    return !!(this.form.user_data_id && this.form.new_address && this.form.scheduled_date);
  }
}