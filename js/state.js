/**
 * EcoPulse Application State Manager
 */

export const AppState = {
  key: 'ecopulse_user_state',
  
  // Default Application Values
  data: {
    hasCalculated: false,
    inputs: {
      vehicleType: 'petrol',
      distance: 100,
      transit: 0,
      flights: 0,
      electricity: 80,
      gas: 40,
      greenPercent: 0,
      dietType: 'mixed',
      shopping: 2,
      foodwaste: 2,
      sortingLevel: 'partial'
    },
    breakdown: {
      transport: 0.0,
      energy: 0.0,
      dietLifestyle: 0.0,
      total: 0.0
    },
    history: [],
    pledges: [], // list of active pledge IDs
    completedToday: [], // list of pledge IDs completed today
    xp: 0,
    level: 1,
    levelName: 'Novice',
    streak: 0,
    lastActiveDate: null,
    lockedOffsets: 0.0, // locked-in offsets in tonnes
    simulatedOffsets: {
      trees: 0,
      solar: 0,
      credits: 0
    }
  },

  load: function() {
    try {
      const saved = localStorage.getItem(this.key);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Deep copy values to ensure safety
        this.data = Object.assign({}, this.data, parsed);
        this.data.inputs = Object.assign({}, this.data.inputs, parsed.inputs);
        this.data.breakdown = Object.assign({}, this.data.breakdown, parsed.breakdown);
        this.data.simulatedOffsets = Object.assign({}, this.data.simulatedOffsets, parsed.simulatedOffsets);
      }
    } catch (e) {
      console.error("Corrupted local storage detected. Resetting state.", e);
    }
  },

  save: function() {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {
      console.error("Failed to write state to local storage", e);
    }
  },

  addXP: function(amount) {
    this.data.xp += amount;
    const oldLevel = this.data.level;
    // Level formula: 100 XP per level
    this.data.level = Math.floor(this.data.xp / 100) + 1;
    
    // Titles based on levels
    const levelsMap = {
      1: 'Novice Eco-Explorer',
      2: 'Green Trailblazer',
      3: 'Carbon Combatant',
      4: 'Climate Advocate',
      5: 'Eco-Champion',
      6: 'Earth Guardian'
    };
    this.data.levelName = levelsMap[this.data.level] || 'Earth Guardian';

    this.save();
    
    // Return true if leveled up to trigger celebration UI
    return this.data.level > oldLevel;
  }
};
