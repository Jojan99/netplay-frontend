import { Routes } from '@angular/router';
import { InventoryItemsComponent } from './inventory-items/inventory-items.component';
import { ItemDetailComponent }     from './item-detail/item-detail.component';
import { CategoriesComponent }     from './categories/categories.component';

export const INVENTORY_ROUTES: Routes = [
  { path: '',              component: InventoryItemsComponent },
  { path: 'items/:id',    component: ItemDetailComponent },
  { path: 'categories',   component: CategoriesComponent },
];
