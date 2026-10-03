import { Routes } from '@angular/router';
import { InventoryItemsComponent } from './inventory-items/inventory-items.component';
import { InventarioComponent }     from './inventario/inventario.component';
import { ItemDetailComponent }     from './item-detail/item-detail.component';
import { CategoriesComponent }     from './categories/categories.component';

export const INVENTORY_ROUTES: Routes = [
  // La pantalla nueva: bodega, técnicos, equipos por serial y asistente.
  { path: '',              component: InventarioComponent },
  // La lista anterior queda accesible por si hace falta comparar.
  { path: 'lista-anterior', component: InventoryItemsComponent },
  { path: 'items/:id',    component: ItemDetailComponent },
  { path: 'categories',   component: CategoriesComponent },
];
