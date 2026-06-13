const { AppState } = require('../app.js');

// Mock localStorage for Node.js Jest environment
global.localStorage = {
  store: {},
  getItem: function(key) { return this.store[key] || null; },
  setItem: function(key, value) { this.store[key] = value.toString(); },
  clear: function() { this.store = {}; }
};

describe('AppState Manager', () => {
  beforeEach(() => {
    // Clear localStorage mock before each test
    localStorage.clear();
    // Reset AppState data
    AppState.data = {
      hasCalculated: false,
      inputs: {},
      results: {},
      pledges: [],
      xp: 0,
      level: 1,
      streak: 0,
      lastActive: null,
      co2Saved: 0,
      simulatedOffsets: { trees: 0, solar: 0, credits: 0 }
    };
  });

  test('saves state to localStorage correctly', () => {
    AppState.data.xp = 150;
    AppState.data.level = 2;
    
    AppState.save();
    
    const savedData = JSON.parse(localStorage.getItem(AppState.key));
    expect(savedData.xp).toBe(150);
    expect(savedData.level).toBe(2);
  });

  test('loads state from localStorage correctly', () => {
    const mockData = {
      hasCalculated: true,
      xp: 500,
      level: 5,
      inputs: { vehicleType: 'electric' },
      results: { total: 1.5 }
    };
    
    localStorage.setItem(AppState.key, JSON.stringify(mockData));
    
    AppState.load();
    
    expect(AppState.data.hasCalculated).toBe(true);
    expect(AppState.data.xp).toBe(500);
    expect(AppState.data.level).toBe(5);
    expect(AppState.data.inputs.vehicleType).toBe('electric');
  });

  test('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(AppState.key, 'invalid-json-string{[');
    
    // Should not throw, should use default state
    expect(() => AppState.load()).not.toThrow();
    
    // Values should remain as defaults
    expect(AppState.data.xp).toBe(0);
  });
});
