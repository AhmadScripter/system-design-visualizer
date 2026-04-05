import { TestBed } from '@angular/core/testing';

import { Diagram } from './diagram';

describe('Diagram', () => {
  let service: Diagram;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Diagram);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
