import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransferConversationModalComponent } from './transfer-conversation-modal.component';

describe('TransferConversationModalComponent', () => {
  let component: TransferConversationModalComponent;
  let fixture: ComponentFixture<TransferConversationModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransferConversationModalComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TransferConversationModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
