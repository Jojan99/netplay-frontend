import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportPaidComponent } from './report-paid.component';

describe('ReportPaidComponent', () => {
  let component: ReportPaidComponent;
  let fixture: ComponentFixture<ReportPaidComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportPaidComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReportPaidComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
