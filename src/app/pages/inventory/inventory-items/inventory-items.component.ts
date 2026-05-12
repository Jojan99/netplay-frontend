import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { InventoryService }           from '../../../services/inventory.service';
import { InventoryItemInterface }     from '../../../models/inventory-item.interface';
import { InventoryCategoryInterface } from '../../../models/inventory-category.interface';

@Component({
  selector: 'app-inventory-items',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './inventory-items.component.html',
  styleUrl: './inventory-items.component.scss',
})
export class InventoryItemsComponent implements OnInit, OnDestroy {
  isDesktop = true;
  skeletor  = true;

  items:         InventoryItemInterface[]     = [];
  filteredItems: InventoryItemInterface[]     = [];
  categories:    InventoryCategoryInterface[] = [];
  locations:     string[]                     = [];

  // Pagination
  currentPage = 1;
  lastPage    = 1;
  totalItems  = 0;
  perPage     = 15;

  // Filters
  searchQuery = '';
  selectedCategoryId: number | '' = '';
  selectedLocation = '';
  showLowStockOnly = false;

  isEditing = false;
  itemForm: InventoryItemInterface = {};

  selectedItemForMovement: InventoryItemInterface | null = null;
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

  // ── Barcode scanner ──────────────────────────────────────────────────────────
  barcodeInput      = '';
  barcodeError      = '';
  cameraActive      = false;
  cameraFallback    = false;
  private videoStream: MediaStream | null = null;
  private scanInterval: any = null;
  @ViewChild('barcodeVideo') barcodeVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('barcodeFileInput') barcodeFileInput?: ElementRef<HTMLInputElement>;

  constructor(
    private inventoryService: InventoryService,
    private router: Router,
  ) {}

  @HostListener('window:resize', ['$event'])
  onResize(_: any) {
    if (typeof window !== 'undefined') {
      this.isDesktop = window.innerWidth > 768;
    }
  }

  ngOnInit() {
    this.onResize(null);
    this.loadItems();
    this.loadCategories();
    this.loadLocations();
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  loadItems(page = 1) {
    this.skeletor = true;
    this.currentPage = page;
    this.inventoryService.getItems({
      q: this.searchQuery,
      category_id: this.selectedCategoryId ? +this.selectedCategoryId : undefined,
      location: this.selectedLocation,
      low_stock: this.showLowStockOnly,
      per_page: this.perPage,
      page,
    }).subscribe(
      data  => {
        this.items = data.data?.data || [];
        this.currentPage = data.data?.current_page || 1;
        this.lastPage = data.data?.last_page || 1;
        this.totalItems = data.data?.total || 0;
        this.filteredItems = [...this.items];
        this.skeletor = false;
      },
      _err  => { this.skeletor = false; },
    );
  }

  loadCategories() {
    this.inventoryService.getCategories().subscribe(
      data => { this.categories = data.data || []; },
      _err => {},
    );
  }

  loadLocations() {
    this.inventoryService.getLocations().subscribe(
      data => { this.locations = data.data || []; },
      _err => {},
    );
  }

  applyFilters() {
    this.loadItems(1);
  }

  getCategoryName(id?: number): string {
    if (!id) return '-';
    return this.categories.find(c => c.id === id)?.name || '-';
  }

  isLowStock(item: InventoryItemInterface): boolean {
    const qty = item.quantity || 0;
    const min = item.stock_min || 0;
    return min > 0 && qty <= min;
  }

  // ── Pagination ───────────────────────────────────────────────────────────────

  goToPage(page: number) {
    if (page < 1 || page > this.lastPage) return;
    this.loadItems(page);
  }

  // ── Item modal ───────────────────────────────────────────────────────────────

  openCreateModal() {
    this.isEditing = false;
    this.itemForm  = {};
    document.getElementById('item-modal')?.classList.remove('hidden');
  }

  openEditModal(item: InventoryItemInterface) {
    this.isEditing = true;
    this.itemForm  = { ...item };
    document.getElementById('item-modal')?.classList.remove('hidden');
  }

  closeItemModal() {
    document.getElementById('item-modal')?.classList.add('hidden');
  }

  saveItem() {
    if (this.isEditing && this.itemForm.id) {
      this.inventoryService.updateItem(this.itemForm.id, this.itemForm).subscribe(data => {
        alert(data.message);
        if (!data.error) { this.closeItemModal(); this.loadItems(this.currentPage); }
      });
    } else {
      this.inventoryService.createItem(this.itemForm).subscribe(data => {
        alert(data.message);
        if (!data.error) { this.closeItemModal(); this.loadItems(1); }
      });
    }
  }

  deleteItem(item: InventoryItemInterface) {
    if (!confirm(`¿Eliminar el ítem "${item.name}"? Esta acción no se puede deshacer.`)) return;
    this.inventoryService.deleteItem(item.id!).subscribe(data => {
      alert(data.message);
      if (!data.error) this.loadItems(this.currentPage);
    });
  }

  viewDetail(item: InventoryItemInterface) {
    this.router.navigate(['/dashboard/inventory/items', item.id]);
  }

  // ── Movement modal ───────────────────────────────────────────────────────────

  openMovementModal(item: InventoryItemInterface) {
    this.selectedItemForMovement = item;
    this.movementForm = {
      inventory_id: item.id!,
      type: 'entrada',
      quantity: 0,
      unit_price: 0,
      description: '',
      reference: '',
      batch_number: '',
      expiry_date: '',
    };
    document.getElementById('movement-modal')?.classList.remove('hidden');
  }

  openMovementModalFromList() {
    this.selectedItemForMovement = null;
    this.movementForm = {
      inventory_id: 0,
      type: 'entrada',
      quantity: 0,
      unit_price: 0,
      description: '',
      reference: '',
      batch_number: '',
      expiry_date: '',
    };
    document.getElementById('movement-modal')?.classList.remove('hidden');
  }

  onMovementItemChange() {
    const id = +this.movementForm.inventory_id;
    this.selectedItemForMovement = this.items.find(i => i.id === id) || null;
  }

  closeMovementModal() {
    document.getElementById('movement-modal')?.classList.add('hidden');
  }

  saveMovement() {
    if (this.movementForm.inventory_id === 0) {
      alert('Selecciona un ítem.');
      return;
    }
    if (this.movementForm.quantity <= 0) {
      alert('La cantidad debe ser mayor a 0.');
      return;
    }
    if (this.movementForm.type === 'salida' && this.selectedItemForMovement) {
      if (this.movementForm.quantity > (this.selectedItemForMovement.quantity || 0)) {
        alert(`Stock insuficiente. Stock actual: ${this.selectedItemForMovement.quantity || 0}`);
        return;
      }
    }
    this.inventoryService.createMovement(this.movementForm).subscribe(data => {
      alert(data.message);
      if (!data.error) { this.closeMovementModal(); this.loadItems(this.currentPage); }
    });
  }

  ngOnDestroy(): void { this.stopCamera(); }

  // ── Override close to stop camera ────────────────────────────────────────────

  closeMovementModalFull(): void {
    this.stopCamera();
    this.barcodeInput = '';
    this.barcodeError = '';
    this.closeMovementModal();
  }

  // ── Barcode: USB scanner input ────────────────────────────────────────────────

  onBarcodeEnter(): void {
    const code = this.barcodeInput.trim();
    this.barcodeInput = '';
    if (code) this.searchByBarcode(code);
  }

  searchByBarcode(code: string): void {
    this.barcodeError = '';
    // 1. Match by SKU or code
    const bySku = this.items.find(i => i.sku === code || i.code === code);
    if (bySku) { this.selectItemForMovement(bySku); return; }
    // 2. Match by item ID
    const byId = this.items.find(i => String(i.id) === code);
    if (byId) { this.selectItemForMovement(byId); return; }
    // 3. Match by name (contains, case-insensitive)
    const byName = this.items.find(i => i.name?.toLowerCase().includes(code.toLowerCase()));
    if (byName) { this.selectItemForMovement(byName); return; }
    this.barcodeError = `No se encontró ningún ítem con código "${code}"`;
  }

  private selectItemForMovement(item: InventoryItemInterface): void {
    this.movementForm.inventory_id  = item.id!;
    this.selectedItemForMovement    = item;
  }

  // ── Barcode: Camera ───────────────────────────────────────────────────────────

  async toggleCamera(): Promise<void> {
    if (this.cameraActive || this.cameraFallback) { this.stopCamera(); return; }

    this.barcodeError = '';

    // Fallback: BarcodeDetector not available (Firefox, older mobile browsers)
    if (!('BarcodeDetector' in window)) {
      this.cameraFallback = true;
      setTimeout(() => this.barcodeFileInput?.nativeElement.click(), 100);
      return;
    }

    try {
      this.videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      this.cameraActive = true;
      setTimeout(() => {
        if (this.barcodeVideo?.nativeElement) {
          this.barcodeVideo.nativeElement.srcObject = this.videoStream;
          this.startBarcodeDetection();
        }
      }, 150);
    } catch (_) {
      this.barcodeError = 'No se pudo acceder a la cámara del dispositivo.';
    }
  }

  async onImageCapture(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) { this.cameraFallback = false; return; }

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);

      try {
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
        });
        const codes: any[] = await detector.detect(canvas);
        if (codes.length > 0) {
          this.searchByBarcode(codes[0].rawValue);
        } else {
          this.barcodeError = 'No se detectó ningún código en la imagen. Intenta con mejor iluminación.';
        }
      } catch (_) {
        this.barcodeError = 'No se pudo procesar la imagen.';
      }
      this.cameraFallback = false;
      (event.target as HTMLInputElement).value = '';
    };
  }

  private startBarcodeDetection(): void {
    const detector = new (window as any).BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
    });
    this.scanInterval = setInterval(async () => {
      if (!this.barcodeVideo?.nativeElement) return;
      try {
        const codes: any[] = await detector.detect(this.barcodeVideo.nativeElement);
        if (codes.length > 0) {
          this.stopCamera();
          this.searchByBarcode(codes[0].rawValue);
        }
      } catch (_) {}
    }, 500);
  }

  stopCamera(): void {
    if (this.scanInterval) { clearInterval(this.scanInterval); this.scanInterval = null; }
    this.videoStream?.getTracks().forEach(t => t.stop());
    this.videoStream   = null;
    this.cameraActive  = false;
    this.cameraFallback = false;
  }
}
