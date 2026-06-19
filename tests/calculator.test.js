import { CarbonCalculator } from '../js/calculator.js';

describe('CarbonCalculator', () => {
  let profile;

  beforeEach(() => {
    profile = {
      vehicleType: 'petrol',
      distance: 100, // miles per week
      transit: 2, // hours per week
      flights: 2, // trips per year
      electricity: 100, // $ per month
      gas: 50, // $ per month
      greenPercent: 0,
      dietType: 'mixed',
      shopping: 2,
      foodwaste: 2,
      sortingLevel: 'partial'
    };
  });

  test('calculates correct structure for standard average profile', () => {
    const result = CarbonCalculator.calculate(profile);
    
    // Check total emissions exist and is greater than 0
    expect(result.total).toBeGreaterThan(0);
    
    // Check it returns the root properties directly
    expect(result.transport).toBeDefined();
    expect(result.energy).toBeDefined();
    expect(result.dietLifestyle).toBeDefined();
  });

  test('calculates correctly for ultra green profile', () => {
    profile = {
      vehicleType: 'electric',
      distance: 50,
      transit: 0,
      flights: 0,
      electricity: 30,
      gas: 0,
      greenPercent: 100,
      dietType: 'vegan',
      shopping: 1,
      foodwaste: 1,
      sortingLevel: 'strict'
    };

    const result = CarbonCalculator.calculate(profile);
    
    // Should be significantly lower than a standard profile
    expect(result.total).toBeLessThan(5); 
    // Green percent 100 and 0 gas means near zero home energy emissions
    expect(result.energy).toBeCloseTo(0);
  });

  test('returns minimum 0.1 for zero inputs', () => {
    profile = {
      vehicleType: 'none',
      distance: 0,
      transit: 0,
      flights: 0,
      electricity: 0,
      gas: 0,
      greenPercent: 0,
      dietType: 'vegan',
      shopping: 0,
      foodwaste: 0,
      sortingLevel: 'none'
    };

    const result = CarbonCalculator.calculate(profile);
    
    // Energy and transport should be 0
    expect(result.transport).toBe(0);
    expect(result.energy).toBe(0);
    // There is a Math.max(0.1) floor enforced in the calculator
    expect(result.total).toBeGreaterThanOrEqual(0.1);
  });
});
