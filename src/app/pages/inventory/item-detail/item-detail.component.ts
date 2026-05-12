import { Component, OnInit } from '@angular/core';
import { CommonModule }     from '@angular/common';
import { FormsModule }      from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InventoryService }          from '../../../services/inventory.service';
import { InventoryItemInterface }    from '../../../models/inventory-item.interface';
import { InventoryMovementInterface } from '../../../models/inventory-movement.interface';

@Component({
  selector: 'app-item-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.scss',
})
export class ItemDetailComponent implements OnInit {
  skeletor  = true;
  item: InventoryItemInterface | null = null;
  movements: InventoryMovementInterface[] = [];

  // Pagination for movements
  movementPage = 1;
  movementLastPage = 1;
  movementTotal = 0;
  movementPerPage = 15;

  movementForm = {
    inventory_id: 0,
    type: 'entrada' as 'entrada' | 'salida' | 'ajuste',
    quantity: 0,
    unit_price: 0,
    description: '',
    reference: '',
    batch_number: '',
    expiry_date: '',
  };

  constructor(
    private route: ActivatedRoute,
    private inventoryService: InventoryService,
  ) {}

  ngOnInit() {
    const id = +this.route.snapshot.paramMap.get('id')!;
    this.loadItem(id);
  }

  loadItem(id: number) {
    this.skeletor = true;
    this.inventoryService.getItem(id).subscribe(
      data => {
        this.item      = data.data || null;
        this.movements = data.data?.movements || [];
        this.skeletor  = false;
      },
      _err => { this.skeletor = false; },
    );
  }

  loadMovements(page = 1) {
    if (!this.item?.id) return;
    this.movementPage = page;
    this.inventoryService.getItemMovements(this.item.id, page, this.movementPerPage).subscribe(
      data => {
        this.movements = data.data?.data || [];
        this.movementPage = data.data?.current_page || 1;
        this.movementLastPage = data.data?.last_page || 1;
        this.movementTotal = data.data?.total || 0;
      }
    );
  }

  openMovementModal() {
    this.movementForm = {
      inventory_id: this.item?.id || 0,
      type: 'entrada',
      quantity: 0,
      unit_price: 0,
      description: '',
      reference: '',
      batch_number: '',
      expiry_date: '',
    };
    document.getElementById('movement-modal-detail')?.classList.remove('hidden');
  }

  closeMovementModal() {
    document.getElementById('movement-modal-detail')?.classList.add('hidden');
  }

  saveMovement() {
    if (this.movementForm.quantity <= 0) {
      alert('La cantidad debe ser mayor a 0.');
      return;
    }
    if (this.movementForm.type === 'salida' && this.item) {
      if (this.movementForm.quantity > (this.item.quantity || 0)) {
        alert(`Stock insuficiente. Stock actual: ${this.item.quantity || 0}`);
        return;
      }
    }
    this.inventoryService.createMovement(this.movementForm).subscribe(data => {
      alert(data.message);
      if (!data.error) {
        this.closeMovementModal();
        this.loadItem(this.item!.id!);
      }
    });
  }

  goToMovementPage(page: number) {
    if (page < 1 || page > this.movementLastPage) return;
    this.loadMovements(page);
  }

  getTypeLabel(type?: string): string {
    return ({ entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' } as any)[type || ''] || '-';
  }

  getTypeBadgeClass(type?: string): string {
    return ({
      entrada: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      salida:  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      ajuste:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    } as any)[type || ''] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }

  isLowStock(item: InventoryItemInterface | null): boolean {
    if (!item) return false;
    const qty = item.quantity || 0;
    const min = item.stock_min || 0;
    return min > 0 && qty <= min;
  }
}
