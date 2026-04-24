import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OntDeviceComponent } from './ont-device.component';

describe('OntDeviceComponent', () => {
  let component: OntDeviceComponent;
  let fixture: ComponentFixture<OntDeviceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OntDeviceComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OntDeviceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
