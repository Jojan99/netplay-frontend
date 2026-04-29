import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from '../../services/finance.service';

interface PaymentMethodSummary {
  name: string;
  total: number;
  count: number;
}

interface PaymentDetail {
  id: number;
  client_name: string;
  amount: number;
  payment_date: string;
  method_name: string;
  invoice_id?: number;
}

interface PaymentsResponse {
  data: PaymentDetail[];
  total: number;
  page: number;
  per_page: number;
}

@Component({
  selector: 'app-payment-methods',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-methods.component.html',
  styleUrls: ['./payment-methods.component.scss'],
})
export class PaymentMethodsComponent implements OnInit {
  period = new Date().toISOString().slice(0, 7);
  searchTerm = '';

  loading = false;
  methods: PaymentMethodSummary[] = [];
  selectedMethod: string | null = null;
  payments: PaymentDetail[] = [];
  paymentsLoading = false;

  page = 1;
  perPage = 15;
  perPageOptions = [15, 25, 50, 100];

  total = 0;
  totalAmount = 0;
  average = 0;
  lastPage = 1;

  constructor(private financeService: FinanceService) {}

  ngOnInit(): void {
    this.loadSummary();
  }

  onPeriodChange(): void {
    this.loadSummary();
    this.selectedMethod = null;
    this.payments = [];
    this.searchTerm = '';
    this.page = 1;
    this.resetCounts();
  }

  onSearchInput(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.page = 1;
    if (this.selectedMethod) this.loadPayments(this.selectedMethod);
  }

  loadSummary(): void {
    this.loading = true;
    this.financeService.getPaymentMethodSummary(this.period).subscribe({
      next: (res) => {
        this.methods = (res.data ?? []).map((item: any) => ({
          name: item.method_name,
          total: parseFloat(item.total_amount) || 0,
          count: parseInt(item.total_payments) || 0,
        }));
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  selectMethod(method: PaymentMethodSummary): void {
    this.selectedMethod = method.name;
    this.searchTerm = '';
    this.page = 1;
    this.resetCounts();
    this.loadPayments(method.name);
  }

  loadPayments(methodName: string): void {
    this.paymentsLoading = true;
    this.financeService.getPaymentsByMethod(methodName, this.period, this.page, this.perPage, this.searchTerm).subscribe({
      next: (res: any) => {
        this.payments = res.data ?? [];
        this.total = res.total ?? 0;
        const totalSum = res.total_sum ?? 0;
        this.lastPage = Math.ceil(this.total / this.perPage) || 1;
        this.totalAmount = totalSum;
        this.average = this.total > 0 ? totalSum / this.total : 0;
        this.paymentsLoading = false;
      },
      error: () => { this.paymentsLoading = false; },
    });
  }

  private resetCounts(): void {
    this.total = 0;
    this.totalAmount = 0;
    this.average = 0;
  }

  changePerPage(): void {
    this.page = 1;
    if (this.selectedMethod) this.loadPayments(this.selectedMethod);
  }

  goBack(): void {
    this.selectedMethod = null;
    this.payments = [];
    this.searchTerm = '';
    this.resetCounts();
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.loadPayments(this.selectedMethod!); }
  }

  nextPage(): void {
    if (this.page < this.lastPage) { this.page++; this.loadPayments(this.selectedMethod!); }
  }

  get displayTotal(): number { return this.totalAmount; }
  get displayAverage(): number { return this.average; }
  get displayFiltered(): number { return this.total; }
}