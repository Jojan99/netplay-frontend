import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CrmService } from '../../../services/crm.service';

@Component({
  selector: 'app-crm-broadcast-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crm-broadcast-modal.component.html',
  styleUrl: './crm-broadcast-modal.component.scss'
})
export class CrmBroadcastModalComponent implements OnInit {

  @Output() closed = new EventEmitter<void>();

  customers: any[] = [];
  filtered:  any[] = [];
  selected:  Set<number> = new Set();
  message    = '';
  search     = '';
  sending    = false;
  sent       = false;
  result: { sent: number; failed: number } | null = null;

  constructor(private crmService: CrmService) {}

  ngOnInit(): void {
    this.crmService.getBroadcastCustomers().subscribe({
      next: res => {
        this.customers = res.data ?? [];
        this.filtered  = this.customers;
      }
    });
  }

  readonly quickFilters = [{ id: 'all', label: 'Todos' }, { id: 'linked', label: 'Clientes vinculados' }, { id: 'active', label: 'Activos' }, { id: 'inactive', label: 'Suspendidos / inactivos' }];
  quickFilter = 'all';
  setQuickFilter(id: string): void { this.quickFilter = id; this.filterCustomers(); }

  filterCustomers(): void {
    const q = this.search.toLowerCase();
    const pool = this.customers.filter(c => {
      const st = (c.status || '').toUpperCase();
      if (this.quickFilter === 'linked') return !!c.linked;
      if (this.quickFilter === 'active') return st.startsWith('ACT');
      if (this.quickFilter === 'inactive') return !!c.linked && !st.startsWith('ACT');
      return true;
    });
    this.filtered = !q ? pool : pool.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.plan?.toLowerCase().includes(q));
  }

  toggleAll(): void {
    if (this.selected.size === this.filtered.length) {
      this.selected.clear();
    } else {
      this.filtered.forEach(c => this.selected.add(c.id));
    }
  }

  toggle(id: number): void {
    this.selected.has(id) ? this.selected.delete(id) : this.selected.add(id);
  }

  get allSelected(): boolean {
    return this.filtered.length > 0 && this.selected.size === this.filtered.length;
  }

  submit(): void {
    if (!this.message.trim() || !this.selected.size || this.sending) return;
    this.sending = true;

    this.crmService.sendBroadcast(this.message, [...this.selected]).subscribe({
      next: res => {
        this.result  = { sent: res.sent, failed: res.failed };
        this.sent    = true;
        this.sending = false;
      },
      error: () => this.sending = false
    });
  }
}
