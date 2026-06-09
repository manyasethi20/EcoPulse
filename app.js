/**
 * ================================================================
 * EcoPulse — Carbon Footprint Awareness Platform
 * ================================================================
 *
 * Architecture:
 *   1. CarbonCalculator  — Pure calculation engine (console-testable)
 *   2. CarbonDatabase    — Static data: items, tips, challenges, badges
 *   3. AppState          — Persistent state machine (localStorage)
 *   4. UIController      — DOM rendering & event wiring
 *
 * All user-facing text is set via textContent / setAttribute to
 * prevent XSS. innerHTML is only used for static, developer-controlled
 * template strings that contain NO user data.
 * ================================================================
 */

/* =================================================================
   1. CARBON CALCULATOR — Pure Utility (window-exported for testing)
================================================================= */

/**
 * CarbonCalculator provides pure functions that convert user inputs
 * into annual CO₂-equivalent emissions in metric tonnes.
 *
 * Emission factors are sourced from:
 *   - UK BEIS / DEFRA 2023 conversion factors
 *   - EPA GHG Equivalencies
 *   - Our World in Data aggregates
 *
 * Usage (browser console):
 *   CarbonCalculator.calculate({ vehicleType:'none', ... })
 */
const CarbonCalculator = (() => {
  'use strict';

  /* ---- Emission Factors ---- */

  /**
   * Vehicle emission factors in kg CO₂ per km driven.
   * Source: BEIS 2023 & EPA average fleet.
   */
  const VEHICLE_FACTORS = {
    none: 0,
    electric: 0.05,        // ~50g/km (grid-average charging)
    small_petrol: 0.14,    // Small car <1.4L
    medium_petrol: 0.19,   // Medium car 1.4-2.0L
    large_petrol: 0.28,    // Large SUV >2.0L
    motorbike: 0.11        // Average motorbike
  };

  /**
   * Flight emissions per single flight (kg CO₂).
   * Includes radiative forcing multiplier of ~1.9.
   */
  const FLIGHT_FACTORS = {
    short: 250,   // ~250 kg per short-haul flight
    long: 1100    // ~1100 kg per long-haul flight
  };

  /** Public transit: kg CO₂ per hour of use (bus/metro blend) */
  const TRANSIT_PER_HOUR = 0.08;  // ~80g per hour

  /**
   * Electricity emission factor: kg CO₂ per kWh.
   * US average grid intensity ~0.42 kg/kWh (EPA eGRID 2022).
   */
  const ELECTRICITY_FACTOR = 0.42;

  /**
   * Heating fuel factors: kg CO₂ per therm or kWh-equivalent.
   */
  const HEATING_FACTORS = {
    none: 0,
    electric: 0.42,        // Same as grid electricity (per kWh)
    natural_gas: 5.3,      // ~5.3 kg CO₂ per therm
    oil: 10.2,             // ~10.2 kg CO₂ per gallon-equivalent therm
    lpg: 6.0,              // ~6.0 kg CO₂ per therm
    wood: 1.5              // ~1.5 kg (biogenic, lower net)
  };

  /**
   * Diet factors: annual food-related CO₂ in tonnes.
   * Source: Poore & Nemecek (2018), Science.
   */
  const DIET_FACTORS = {
    vegan: 1.5,
    vegetarian: 1.7,
    pescatarian: 1.9,
    low_meat: 2.5,
    medium_meat: 3.3,
    high_meat: 3.9
  };

  /** Food waste multiplier */
  const WASTE_MULTIPLIERS = {
    very_low: 0.9,
    low: 1.0,
    medium: 1.1,
    high: 1.3
  };

  /** Shopping (clothing) annual kg CO₂ */
  const SHOPPING_FACTORS = {
    minimal: 50,
    low: 150,
    medium: 350,
    high: 600,
    very_high: 1000
  };

  /** Electronics annual kg CO₂ */
  const ELECTRONICS_FACTORS = {
    none: 0,
    low: 200,
    medium: 500,
    high: 900
  };

  /** Streaming: kg CO₂ per hour per day annualised */
  const STREAMING_FACTOR = 0.036 * 365; // ~13 kg/yr per daily hour

  /** Recycling offset fraction */
  const RECYCLING_OFFSETS = {
    none: 0,
    basic: 0.05,
    good: 0.10,
    excellent: 0.18
  };

  /* ---- Main Calculate Function ---- */

  /**
   * @param {Object} inputs — form values from onboarding wizard
   * @returns {{ total, transport, energy, food, lifestyle, breakdown }}
   */
  function calculate(inputs) {
    const i = sanitiseInputs(inputs);

    /* Transport */
    const vehicleCO2 = (VEHICLE_FACTORS[i.vehicleType] || 0) * i.annualKm;
    const flightCO2 = (i.flightsShort * FLIGHT_FACTORS.short)
                    + (i.flightsLong * FLIGHT_FACTORS.long);
    const transitCO2 = i.publicTransit * 52 * TRANSIT_PER_HOUR;
    const transportKg = vehicleCO2 + flightCO2 + transitCO2;

    /* Home Energy */
    const greenFraction = 1 - (i.greenEnergyPct / 100);
    const elecCO2 = (i.electricityKwh * 12 * ELECTRICITY_FACTOR * greenFraction) / i.householdSize;
    const heatCO2 = (i.heatingUsage * 12 * (HEATING_FACTORS[i.heatingType] || 0)) / i.householdSize;
    const energyKg = elecCO2 + heatCO2;

    /* Diet & Food */
    const baseDiet = (DIET_FACTORS[i.dietType] || 2.5) * 1000;  // to kg
    const wasteMult = WASTE_MULTIPLIERS[i.foodWaste] || 1.0;
    const localReduction = 1 - (i.localFoodPct / 100 * 0.1);    // max 10% reduction
    const foodKg = baseDiet * wasteMult * localReduction;

    /* Lifestyle */
    const shoppingKg = SHOPPING_FACTORS[i.shoppingFreq] || 350;
    const electronicsKg = ELECTRONICS_FACTORS[i.electronicsFreq] || 200;
    const streamingKg = i.streamingHrs * STREAMING_FACTOR;
    const recycleOffset = RECYCLING_OFFSETS[i.recyclingLevel] || 0;
    const lifestyleKg = (shoppingKg + electronicsKg + streamingKg) * (1 - recycleOffset);

    /* Total */
    const totalKg = transportKg + energyKg + foodKg + lifestyleKg;
    const totalTons = totalKg / 1000;

    return {
      total: round(totalTons, 2),
      transport: round(transportKg / 1000, 2),
      energy: round(energyKg / 1000, 2),
      food: round(foodKg / 1000, 2),
      lifestyle: round(lifestyleKg / 1000, 2),
      breakdown: {
        vehicle: round(vehicleCO2 / 1000, 2),
        flights: round(flightCO2 / 1000, 2),
        transit: round(transitCO2 / 1000, 2),
        electricity: round(elecCO2 / 1000, 2),
        heating: round(heatCO2 / 1000, 2),
        diet: round(baseDiet * wasteMult * localReduction / 1000, 2),
        shopping: round(shoppingKg / 1000, 2),
        electronics: round(electronicsKg / 1000, 2),
        streaming: round(streamingKg / 1000, 2)
      }
    };
  }

  /**
   * Calculate offset requirements.
   * @param {number} tonnes — CO₂ to offset
   * @param {number} years  — time horizon
   */
  function calculateOffset(tonnes, years) {
    const totalCO2 = tonnes * years;
    return {
      trees: Math.ceil(totalCO2 / 0.022),        // ~22 kg CO₂ per tree per year
      solarPanels: Math.ceil(totalCO2 / 1.5),    // ~1.5t offset per panel over lifetime amortised
      windCredits: Math.ceil(totalCO2 / 1.0),    // 1 credit = 1 tonne
      costLow: round(totalCO2 * 10, 0),          // $10/tonne (voluntary market low)
      costHigh: round(totalCO2 * 50, 0),         // $50/tonne (gold standard)
      totalCO2: round(totalCO2, 2)
    };
  }

  /* ---- Helpers ---- */

  function sanitiseInputs(raw) {
    return {
      vehicleType: String(raw.vehicleType || 'none'),
      annualKm: clamp(Number(raw.annualKm) || 0, 0, 200000),
      flightsShort: clamp(Number(raw.flightsShort) || 0, 0, 100),
      flightsLong: clamp(Number(raw.flightsLong) || 0, 0, 50),
      publicTransit: clamp(Number(raw.publicTransit) || 0, 0, 168),
      electricityKwh: clamp(Number(raw.electricityKwh) || 0, 0, 10000),
      heatingType: String(raw.heatingType || 'none'),
      heatingUsage: clamp(Number(raw.heatingUsage) || 0, 0, 500),
      greenEnergyPct: clamp(Number(raw.greenEnergyPct) || 0, 0, 100),
      householdSize: clamp(Number(raw.householdSize) || 1, 1, 20),
      dietType: String(raw.dietType || 'low_meat'),
      foodWaste: String(raw.foodWaste || 'medium'),
      localFoodPct: clamp(Number(raw.localFoodPct) || 0, 0, 100),
      shoppingFreq: String(raw.shoppingFreq || 'medium'),
      electronicsFreq: String(raw.electronicsFreq || 'low'),
      streamingHrs: clamp(Number(raw.streamingHrs) || 0, 0, 24),
      recyclingLevel: String(raw.recyclingLevel || 'good')
    };
  }

  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
  function round(val, decimals) { const f = Math.pow(10, decimals); return Math.round(val * f) / f; }

  /* Public API */
  return { calculate, calculateOffset, sanitiseInputs };
})();

/* Export to window for console testing */
window.CarbonCalculator = CarbonCalculator;


/* =================================================================
   2. CARBON DATABASE — Static Content
================================================================= */

const CarbonDatabase = (() => {
  'use strict';

  /** Carbon footprint of common items (kg CO₂) */
  const ITEMS = [
    { name: 'Cup of Coffee', icon: '☕', co2: 0.21, unit: 'per cup', desc: 'Including milk, water heating, and cup' },
    { name: 'Cup of Tea', icon: '🍵', co2: 0.02, unit: 'per cup', desc: 'Much lower than coffee due to less processing' },
    { name: 'Glass of Beer', icon: '🍺', co2: 0.50, unit: 'per pint', desc: 'Brewing, refrigeration, and transport' },
    { name: 'Plastic Bottle', icon: '🍶', co2: 0.08, unit: 'per bottle', desc: 'Production + disposal of 500ml PET bottle' },
    { name: 'Reusable Water Bottle', icon: '💧', co2: 0.01, unit: 'per use', desc: 'Amortised over 500+ uses' },
    { name: 'Hamburger', icon: '🍔', co2: 3.0, unit: 'per burger', desc: 'Beef patty with all the fixings' },
    { name: 'Veggie Burger', icon: '🥗', co2: 0.5, unit: 'per burger', desc: 'Plant-based patty with toppings' },
    { name: 'Chicken Breast', icon: '🍗', co2: 1.8, unit: 'per serving', desc: '200g serving including farming' },
    { name: 'Slice of Pizza', icon: '🍕', co2: 0.6, unit: 'per slice', desc: 'Average cheese pizza slice' },
    { name: 'Avocado', icon: '🥑', co2: 0.4, unit: 'per fruit', desc: 'Including water-intensive farming and shipping' },
    { name: 'Banana', icon: '🍌', co2: 0.08, unit: 'per fruit', desc: 'One of the most eco-friendly fruits' },
    { name: 'Apple', icon: '🍎', co2: 0.05, unit: 'per fruit', desc: 'Locally grown is even lower' },
    { name: 'Rice (1kg)', icon: '🍚', co2: 2.7, unit: 'per kg', desc: 'Methane from paddy fields' },
    { name: 'Pasta (1kg)', icon: '🍝', co2: 0.9, unit: 'per kg', desc: 'Durum wheat production' },
    { name: '1 Hour Streaming', icon: '📺', co2: 0.036, unit: 'per hour', desc: 'Netflix/YouTube via data centres' },
    { name: '1 Hour Gaming', icon: '🎮', co2: 0.06, unit: 'per hour', desc: 'Console/PC energy use + servers' },
    { name: 'Google Search', icon: '🔍', co2: 0.0002, unit: 'per search', desc: 'Data centre energy for one query' },
    { name: 'Email (no attachment)', icon: '📧', co2: 0.004, unit: 'per email', desc: 'Server storage and transmission' },
    { name: 'Email with Attachment', icon: '📎', co2: 0.05, unit: 'per email', desc: '10x more than plain email' },
    { name: 'New Smartphone', icon: '📱', co2: 70, unit: 'per device', desc: 'Manufacturing, mining rare metals' },
    { name: 'New Laptop', icon: '💻', co2: 300, unit: 'per device', desc: 'Full lifecycle manufacturing' },
    { name: 'New Pair of Jeans', icon: '👖', co2: 33.4, unit: 'per pair', desc: 'Cotton farming, dyeing, transport' },
    { name: 'Cotton T-Shirt', icon: '👕', co2: 7.0, unit: 'per shirt', desc: 'Growing, manufacturing, shipping' },
    { name: 'Load of Laundry', icon: '🧺', co2: 0.6, unit: 'per load', desc: 'Warm wash and tumble dry' },
    { name: 'Cold Water Laundry', icon: '❄️', co2: 0.2, unit: 'per load', desc: 'Cold wash saves ~65% energy' },
    { name: 'Driving 1 km', icon: '🚗', co2: 0.19, unit: 'per km', desc: 'Average medium petrol car' },
    { name: 'Bus Ride (10 km)', icon: '🚌', co2: 0.8, unit: 'per trip', desc: 'Per-passenger shared emissions' },
    { name: 'Train Ride (10 km)', icon: '🚆', co2: 0.4, unit: 'per trip', desc: 'Electric rail is even lower' },
    { name: 'Short-Haul Flight', icon: '✈️', co2: 250, unit: 'per flight', desc: '~3hr domestic, incl. radiative forcing' },
    { name: 'Long-Haul Flight', icon: '🌍', co2: 1100, unit: 'per flight', desc: 'Transatlantic round-trip equivalent' },
    { name: 'Bath', icon: '🛁', co2: 2.6, unit: 'per bath', desc: 'Heating ~150L of water' },
    { name: 'Shower (8 min)', icon: '🚿', co2: 0.9, unit: 'per shower', desc: 'Average gas-heated shower' },
    { name: '1 kg of Beef', icon: '🥩', co2: 27, unit: 'per kg', desc: 'Highest food emission per weight' },
    { name: '1 kg of Cheese', icon: '🧀', co2: 13.5, unit: 'per kg', desc: 'Dairy production is carbon intensive' },
    { name: 'Glass of Milk', icon: '🥛', co2: 0.6, unit: 'per glass', desc: '~250ml serving' },
    { name: 'Chocolate Bar', icon: '🍫', co2: 1.5, unit: 'per 100g', desc: 'Cocoa farming + processing' }
  ];

  /** Eco tips for accordion */
  const TIPS = [
    {
      emoji: '🚗',
      title: 'Switch to Active or Public Transport',
      category: 'Transport',
      categoryColor: '#3B82F6',
      body: 'Transportation accounts for roughly 29% of greenhouse gas emissions. Every trip you can walk, cycle, or take public transit instead of driving makes a measurable difference.',
      bullets: [
        'Walk or cycle for trips under 3 km — it is faster than driving in most cities',
        'Use public transit for your commute — a bus is 4× more efficient per passenger',
        'Combine multiple errands into one trip to reduce cold starts',
        'Consider carpooling or ride-sharing for longer distances'
      ],
      impact: 'Save up to 2.4 tonnes CO₂/year'
    },
    {
      emoji: '🥦',
      title: 'Reduce Meat Consumption',
      category: 'Food',
      categoryColor: '#10B981',
      body: 'The global food system produces about 26% of all greenhouse gas emissions, and red meat is the single largest contributor. Even small dietary shifts create big impact.',
      bullets: [
        'Try "Meatless Mondays" — one day per week saves ~340 kg CO₂/year',
        'Replace beef with chicken or plant protein for an immediate 5× reduction',
        'Buy seasonal, local produce to cut food transport emissions',
        'Reduce food waste — plan meals and use leftovers creatively'
      ],
      impact: 'Save up to 1.5 tonnes CO₂/year'
    },
    {
      emoji: '⚡',
      title: 'Optimize Home Energy Use',
      category: 'Energy',
      categoryColor: '#F59E0B',
      body: 'Household energy use is one of the easiest categories to improve. Small habit changes and efficient appliances can slash your home emissions dramatically.',
      bullets: [
        'Switch to LED bulbs — they use 75% less energy and last 25× longer',
        'Set your thermostat 1°C lower in winter — saves ~300 kg CO₂/year',
        'Unplug devices on standby — phantom loads waste 5–10% of home energy',
        'Switch to a certified green energy tariff from your utility provider',
        'Wash clothes at 30°C instead of 60°C to halve laundry energy'
      ],
      impact: 'Save up to 1.8 tonnes CO₂/year'
    },
    {
      emoji: '🛍️',
      title: 'Embrace Conscious Consumption',
      category: 'Lifestyle',
      categoryColor: '#8B5CF6',
      body: 'Every product you buy has an embedded carbon footprint from raw materials, manufacturing, shipping, and disposal. Buying less and buying better is powerful.',
      bullets: [
        'Choose quality over quantity — durable goods have lower lifetime emissions',
        'Buy second-hand clothing, electronics, and furniture',
        'Repair items instead of replacing them',
        'Avoid fast fashion — the industry emits 1.2 billion tonnes CO₂ annually',
        'Opt for minimal or recyclable packaging when shopping'
      ],
      impact: 'Save up to 1.0 tonnes CO₂/year'
    },
    {
      emoji: '✈️',
      title: 'Fly Less, Fly Smarter',
      category: 'Transport',
      categoryColor: '#3B82F6',
      body: 'A single transatlantic flight can emit more CO₂ than many people produce in an entire year. Aviation is the most carbon-intensive way to travel.',
      bullets: [
        'Take trains for trips under 800 km — often faster door-to-door',
        'Use video calls instead of flying for business meetings',
        'When you must fly, choose economy class (3× less per seat than business)',
        'Use direct flights — takeoffs and landings produce the most emissions',
        'Offset unavoidable flights through certified carbon credits'
      ],
      impact: 'Save up to 2.0 tonnes CO₂/year per avoided long-haul flight'
    },
    {
      emoji: '♻️',
      title: 'Master Recycling & Waste Reduction',
      category: 'Lifestyle',
      categoryColor: '#8B5CF6',
      body: 'Landfill waste produces methane, a greenhouse gas 80× more potent than CO₂ over 20 years. Proper waste management is crucial climate action.',
      bullets: [
        'Learn your local recycling rules — contamination ruins entire batches',
        'Compost food scraps — diverts 30% of household waste from landfill',
        'Use reusable bags, bottles, and containers to eliminate single-use plastics',
        'Donate items you no longer need instead of throwing them away',
        'Choose products with minimal or recyclable packaging'
      ],
      impact: 'Save up to 0.5 tonnes CO₂/year'
    },
    {
      emoji: '💧',
      title: 'Conserve Water & Energy Together',
      category: 'Energy',
      categoryColor: '#F59E0B',
      body: 'Heating water for showers, baths, and laundry is one of the top household energy uses. Saving water directly saves energy and carbon.',
      bullets: [
        'Take 5-minute showers instead of baths — saves 80% of water heating energy',
        'Install a low-flow showerhead — cuts water use by 40% with no comfort loss',
        'Fix dripping taps — a single drip wastes 15,000+ litres per year',
        'Use a dishwasher (fully loaded) instead of hand-washing — it uses less water',
        'Collect rainwater for garden irrigation'
      ],
      impact: 'Save up to 0.4 tonnes CO₂/year'
    }
  ];

  /** Challenges / Pledges */
  const CHALLENGES = [
    { id: 'car_free_3',      emoji: '🚶', title: 'Go Car-Free for 3 Days',           desc: 'Walk, cycle, or use public transit for all trips.',           xp: 75,  reduction: '4.5 kg CO₂', category: 'transport' },
    { id: 'meatless_week',   emoji: '🥬', title: 'Meatless Week',                    desc: 'Eat fully vegetarian for 7 consecutive days.',                xp: 100, reduction: '6.5 kg CO₂', category: 'food' },
    { id: 'cold_wash',       emoji: '❄️', title: 'Switch to Cold Water Wash',        desc: 'Do all laundry loads in cold water this week.',               xp: 40,  reduction: '2.0 kg CO₂', category: 'energy' },
    { id: 'no_streaming',    emoji: '📵', title: 'Screen-Free Evening',              desc: 'No streaming or gaming after 8 PM for 5 days.',              xp: 50,  reduction: '0.9 kg CO₂', category: 'lifestyle' },
    { id: 'reusable_bottle', emoji: '💧', title: 'Reusable Bottle Only',             desc: 'Use only reusable bottles for a full week.',                  xp: 30,  reduction: '0.5 kg CO₂', category: 'lifestyle' },
    { id: 'local_food',      emoji: '🥕', title: 'Buy 100% Local This Week',        desc: 'Source all groceries from local farmers or markets.',         xp: 60,  reduction: '3.2 kg CO₂', category: 'food' },
    { id: 'thermostat_down', emoji: '🌡️', title: 'Thermostat Down 2°C',            desc: 'Lower your heating by 2°C for the full week.',               xp: 55,  reduction: '4.0 kg CO₂', category: 'energy' },
    { id: 'no_plastic',      emoji: '🚫', title: 'Zero Single-Use Plastic',          desc: 'Avoid all single-use plastics for 5 days.',                  xp: 65,  reduction: '1.2 kg CO₂', category: 'lifestyle' },
    { id: 'bike_commute',    emoji: '🚴', title: 'Bike Commute Challenge',           desc: 'Cycle to work or school every day this week.',               xp: 80,  reduction: '8.0 kg CO₂', category: 'transport' },
    { id: 'compost_week',    emoji: '🌱', title: 'Start Composting',                 desc: 'Compost all food scraps for 7 days.',                        xp: 45,  reduction: '2.5 kg CO₂', category: 'lifestyle' },
    { id: 'led_swap',        emoji: '💡', title: 'LED Light Swap',                   desc: 'Replace 5 remaining incandescent bulbs with LEDs.',          xp: 35,  reduction: '1.8 kg CO₂', category: 'energy' },
    { id: 'public_transit_w', emoji: '🚌', title: 'Public Transit Week',             desc: 'Use only public transit for commuting this week.',           xp: 70,  reduction: '7.0 kg CO₂', category: 'transport' }
  ];

  /** Badges / Achievements */
  const BADGES = [
    { id: 'first_step',       emoji: '🌱', name: 'First Step',         desc: 'Complete your first assessment',       condition: (s) => s.assessmentCount >= 1 },
    { id: 'green_commuter',   emoji: '🚴', name: 'Green Commuter',    desc: 'Complete 3 transport challenges',      condition: (s) => countCategory(s, 'transport') >= 3 },
    { id: 'home_innovator',   emoji: '💡', name: 'Home Innovator',    desc: 'Complete 3 energy challenges',         condition: (s) => countCategory(s, 'energy') >= 3 },
    { id: 'clean_eater',      emoji: '🥗', name: 'Clean Eater',       desc: 'Complete 2 food challenges',           condition: (s) => countCategory(s, 'food') >= 2 },
    { id: 'eco_warrior',      emoji: '⚔️', name: 'Eco Warrior',      desc: 'Earn 500+ total XP',                   condition: (s) => s.xp >= 500 },
    { id: 'streak_7',         emoji: '🔥', name: 'Week Warrior',      desc: 'Maintain a 7-day streak',              condition: (s) => s.streak >= 7 },
    { id: 'streak_30',        emoji: '🏆', name: 'Monthly Legend',     desc: 'Maintain a 30-day streak',             condition: (s) => s.streak >= 30 },
    { id: 'carbon_zero',      emoji: '🌍', name: 'Carbon Zero Hero',  desc: 'Reach Level 5',                        condition: (s) => s.level >= 5 },
    { id: 'knowledge_seeker', emoji: '📚', name: 'Knowledge Seeker',  desc: 'Search 10 items in carbon search',     condition: (s) => s.searchCount >= 10 },
    { id: 'pledge_master',    emoji: '🎯', name: 'Pledge Master',     desc: 'Complete 6 total challenges',          condition: (s) => s.completedChallenges.length >= 6 }
  ];

  function countCategory(state, cat) {
    return state.completedChallenges.filter(id => {
      const ch = CHALLENGES.find(c => c.id === id);
      return ch && ch.category === cat;
    }).length;
  }

  /** Level thresholds */
  const LEVELS = [
    { level: 1, title: 'Eco Seedling',     xpRequired: 0 },
    { level: 2, title: 'Green Sprout',     xpRequired: 100 },
    { level: 3, title: 'Nature Guardian',  xpRequired: 300 },
    { level: 4, title: 'Climate Champion', xpRequired: 600 },
    { level: 5, title: 'Carbon Zero Hero', xpRequired: 1000 },
    { level: 6, title: 'Earth Sage',       xpRequired: 1500 },
    { level: 7, title: 'Planet Protector',  xpRequired: 2200 }
  ];

  /** Offset methods for educational cards */
  const OFFSET_METHODS = [
    { icon: '🌳', title: 'Tree Planting',           desc: 'A mature tree absorbs about 22 kg of CO₂ per year. Reforestation projects also restore habitats and protect biodiversity.', factor: '~22 kg CO₂/tree/year' },
    { icon: '☀️', title: 'Solar Energy Credits',     desc: 'Investing in solar farms displaces fossil fuel electricity. One residential panel offsets ~1.5 tonnes CO₂ over its lifetime.', factor: '~1.5t CO₂/panel lifetime' },
    { icon: '💨', title: 'Wind Energy Credits',      desc: 'Wind turbines produce clean electricity with near-zero operational emissions. Credits fund new installations.', factor: '~1.0t CO₂ per credit' },
    { icon: '🌾', title: 'Soil Carbon Sequestration',desc: 'Regenerative agriculture practices capture carbon in soil. This method also improves food production and water retention.', factor: '~0.5t CO₂/hectare/year' },
    { icon: '🌊', title: 'Blue Carbon (Mangroves)',  desc: 'Coastal ecosystems like mangroves store up to 10× more carbon than terrestrial forests per hectare.', factor: '~3.7t CO₂/hectare/year' },
    { icon: '🔋', title: 'Clean Cookstove Projects', desc: 'Replacing traditional biomass stoves in developing nations reduces deforestation and indoor air pollution.', factor: '~2.0t CO₂/stove/year' }
  ];

  return { ITEMS, TIPS, CHALLENGES, BADGES, LEVELS, OFFSET_METHODS };
})();


/* =================================================================
   3. APP STATE — Persistent State Machine
================================================================= */

const AppState = (() => {
  'use strict';

  const STORAGE_KEY = 'ecopulse_user_data';

  /** Default blank state */
  function defaultState() {
    return {
      hasCompletedOnboarding: false,
      assessmentCount: 0,
      inputs: {},
      results: null,
      history: [],          // Array of { date, total, transport, energy, food, lifestyle }
      xp: 0,
      level: 1,
      streak: 0,
      lastCheckInDate: null,
      activePledges: [],    // Challenge IDs
      completedChallenges: [], // Challenge IDs (all-time)
      unlockedBadges: [],
      searchCount: 0
    };
  }

  let _state = defaultState();

  /** Load from localStorage with corruption guard */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Validate structure
      if (typeof parsed !== 'object' || parsed === null) return;
      // Merge onto defaults (handles added fields gracefully)
      _state = { ...defaultState(), ...parsed };
      // Re-validate arrays
      if (!Array.isArray(_state.history)) _state.history = [];
      if (!Array.isArray(_state.activePledges)) _state.activePledges = [];
      if (!Array.isArray(_state.completedChallenges)) _state.completedChallenges = [];
      if (!Array.isArray(_state.unlockedBadges)) _state.unlockedBadges = [];
    } catch (e) {
      console.warn('[EcoPulse] Corrupted localStorage, resetting state.', e);
      _state = defaultState();
    }
  }

  /** Persist to localStorage */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (e) {
      console.error('[EcoPulse] Failed to save state:', e);
    }
  }

  /** Get a copy of the state */
  function get() { return { ..._state }; }

  /** Update state and persist */
  function update(partial) {
    Object.assign(_state, partial);
    save();
  }

  /** Compute level from XP */
  function computeLevel(xp) {
    const levels = CarbonDatabase.LEVELS;
    let currentLevel = levels[0];
    for (const lvl of levels) {
      if (xp >= lvl.xpRequired) currentLevel = lvl;
    }
    return currentLevel;
  }

  /** Get XP needed for next level */
  function xpForNextLevel(xp) {
    const levels = CarbonDatabase.LEVELS;
    for (const lvl of levels) {
      if (xp < lvl.xpRequired) return lvl.xpRequired;
    }
    return levels[levels.length - 1].xpRequired;
  }

  /** Reset */
  function reset() {
    _state = defaultState();
    save();
  }

  load();

  return { get, update, computeLevel, xpForNextLevel, reset, load };
})();


/* =================================================================
   4. UI CONTROLLER — DOM Rendering & Events
================================================================= */

const UIController = (() => {
  'use strict';

  /* ---- Cached DOM References ---- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let donutChart = null;
  let lineChart = null;
  let currentStep = 0;
  const TOTAL_STEPS = 4;

  /* ---- Initialisation ---- */

  function init() {
    initLucide();
    bindEvents();
    checkInitialRoute();
  }

  function initLucide() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  /* ---- Screen Management ---- */

  function showScreen(screenId) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const screen = $('#' + screenId);
    if (screen) {
      screen.classList.add('active');
      // Re-render Lucide icons on new screen
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
    }
  }

  function checkInitialRoute() {
    const state = AppState.get();
    if (state.hasCompletedOnboarding && state.results) {
      showScreen('app-screen');
      renderDashboard();
      renderActionHub();
      renderLearnTab();
      renderOffsetTab();
    } else {
      showScreen('splash-screen');
    }
  }

  /* ---- Event Binding ---- */

  function bindEvents() {
    /* Splash */
    $('#start-assessment-btn').addEventListener('click', () => {
      showScreen('calculator-screen');
      currentStep = 0;
      showStep(0);
      updateLiveCounter();
    });

    $('#skip-to-dashboard-btn').addEventListener('click', () => {
      const state = AppState.get();
      if (state.hasCompletedOnboarding && state.results) {
        showScreen('app-screen');
        renderDashboard();
        renderActionHub();
        renderLearnTab();
        renderOffsetTab();
      } else {
        showScreen('calculator-screen');
        currentStep = 0;
        showStep(0);
        updateLiveCounter();
      }
    });

    /* Calculator Nav */
    $('#calc-prev-btn').addEventListener('click', () => {
      if (currentStep > 0) {
        currentStep--;
        showStep(currentStep);
      }
    });

    $('#calc-next-btn').addEventListener('click', () => {
      if (currentStep < TOTAL_STEPS - 1) {
        currentStep++;
        showStep(currentStep);
      } else {
        finishAssessment();
      }
    });

    /* Calculator inputs - live counter */
    $$('#calculator-screen input, #calculator-screen select').forEach(el => {
      el.addEventListener('change', updateLiveCounter);
      el.addEventListener('input', updateLiveCounter);
    });

    /* Results → Dashboard */
    $('#go-to-dashboard-btn').addEventListener('click', () => {
      showScreen('app-screen');
      renderDashboard();
      renderActionHub();
      renderLearnTab();
      renderOffsetTab();
    });

    /* Recalculate */
    $('#recalculate-btn').addEventListener('click', () => {
      showScreen('calculator-screen');
      currentStep = 0;
      showStep(0);
      updateLiveCounter();
    });

    /* Tab Navigation */
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    /* Simulate progress button */
    $('#simulate-progress-btn').addEventListener('click', simulateProgress);

    /* Carbon search */
    $('#carbon-search-btn').addEventListener('click', performCarbonSearch);
    $('#carbon-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performCarbonSearch();
    });

    /* Search tags */
    $$('.search-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        $('#carbon-search-input').value = tag.dataset.query;
        performCarbonSearch();
      });
    });

    /* Offset calculator */
    $('#calculate-offset-btn').addEventListener('click', performOffsetCalc);

    /* Modals — close on Esc */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('levelup-modal');
        closeModal('badge-modal');
      }
    });

    /* Modal close buttons */
    $('#levelup-close-btn').addEventListener('click', () => closeModal('levelup-modal'));
    $('#badge-close-btn').addEventListener('click', () => closeModal('badge-modal'));

    /* Modal overlay click to close */
    $$('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
  }

  /* ---- Calculator Step Management ---- */

  function showStep(step) {
    $$('.calc-step').forEach((el, i) => {
      el.classList.toggle('active', i === step);
    });

    // Update progress dots
    $$('.step-dot').forEach((dot, i) => {
      dot.classList.remove('active', 'completed');
      if (i === step) dot.classList.add('active');
      else if (i < step) dot.classList.add('completed');
    });

    // Update progress lines
    $$('.step-line').forEach((line, i) => {
      line.classList.toggle('completed', i < step);
    });

    // Update buttons
    $('#calc-prev-btn').disabled = step === 0;
    const nextBtn = $('#calc-next-btn');
    if (step === TOTAL_STEPS - 1) {
      nextBtn.innerHTML = '';
      const txt = document.createTextNode('See My Results ');
      nextBtn.appendChild(txt);
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'bar-chart-2');
      icon.setAttribute('aria-hidden', 'true');
      nextBtn.appendChild(icon);
      if (window.lucide) window.lucide.createIcons();
    } else {
      nextBtn.innerHTML = '';
      const txt = document.createTextNode('Next ');
      nextBtn.appendChild(txt);
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'chevron-right');
      icon.setAttribute('aria-hidden', 'true');
      nextBtn.appendChild(icon);
      if (window.lucide) window.lucide.createIcons();
    }
  }

  /* ---- Live Counter ---- */

  function gatherInputs() {
    return {
      vehicleType: $('#vehicle-type').value,
      annualKm: $('#annual-km').value,
      flightsShort: $('#flights-short').value,
      flightsLong: $('#flights-long').value,
      publicTransit: $('#public-transit').value,
      electricityKwh: $('#electricity-kwh').value,
      heatingType: $('#heating-type').value,
      heatingUsage: $('#heating-usage').value,
      greenEnergyPct: $('#green-energy-pct').value,
      householdSize: $('#household-size').value,
      dietType: $('#diet-type').value,
      foodWaste: $('#food-waste').value,
      localFoodPct: $('#local-food-pct').value,
      shoppingFreq: $('#shopping-freq').value,
      electronicsFreq: $('#electronics-freq').value,
      streamingHrs: $('#streaming-hrs').value,
      recyclingLevel: $('#recycling-level').value
    };
  }

  function updateLiveCounter() {
    const inputs = gatherInputs();
    const result = CarbonCalculator.calculate(inputs);
    const el = $('#live-co2');
    el.textContent = result.total.toFixed(1);
    // Pulse animation
    el.style.transform = 'scale(1.15)';
    setTimeout(() => { el.style.transform = 'scale(1)'; }, 200);
  }

  /* ---- Finish Assessment ---- */

  function finishAssessment() {
    const inputs = gatherInputs();
    const result = CarbonCalculator.calculate(inputs);
    const state = AppState.get();

    // Save to state
    const historyEntry = {
      date: new Date().toISOString().split('T')[0],
      total: result.total,
      transport: result.transport,
      energy: result.energy,
      food: result.food,
      lifestyle: result.lifestyle
    };

    const newHistory = [...state.history, historyEntry];
    // Keep last 20 entries
    if (newHistory.length > 20) newHistory.splice(0, newHistory.length - 20);

    AppState.update({
      hasCompletedOnboarding: true,
      assessmentCount: state.assessmentCount + 1,
      inputs: inputs,
      results: result,
      history: newHistory
    });

    // Show results screen
    showScreen('results-screen');
    animateResults(result);

    // Check for first-step badge
    checkBadges();
  }

  /* ---- Results Animation ---- */

  function animateResults(result) {
    // Animate ring
    const ringFill = $('#results-ring-fill');
    const circumference = 2 * Math.PI * 85;  // ~534

    // Add gradient defs to SVG if not already present
    const svg = ringFill.closest('svg');
    if (!svg.querySelector('#ringGrad')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
      grad.id = 'ringGrad';
      grad.setAttribute('x1', '0%');
      grad.setAttribute('y1', '0%');
      grad.setAttribute('x2', '100%');
      grad.setAttribute('y2', '100%');
      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.setAttribute('stop-color', '#34D399');
      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.setAttribute('stop-color', '#10B981');
      grad.appendChild(stop1);
      grad.appendChild(stop2);
      defs.appendChild(grad);
      svg.prepend(defs);
    }

    // Calculate fill percentage (cap at 20 tonnes = full)
    const pct = Math.min(result.total / 20, 1);
    const offset = circumference * (1 - pct);

    ringFill.style.strokeDasharray = circumference;
    ringFill.style.strokeDashoffset = circumference;

    requestAnimationFrame(() => {
      setTimeout(() => {
        ringFill.style.strokeDashoffset = offset;
      }, 100);
    });

    // Animate number
    animateNumber($('#results-total-co2'), 0, result.total, 1500);

    // Comparison badge
    const badge = $('#results-badge');
    const compText = $('#results-comparison-text');

    if (result.total <= 2.0) {
      badge.textContent = '🌟 Exceptional — Below Paris Target!';
      badge.className = 'comparison-badge';
      compText.textContent = 'Your footprint is below the Paris Agreement 2030 target of 2.0 tonnes. You\'re leading the way!';
    } else if (result.total <= 4.8) {
      badge.textContent = '✅ Below Global Average';
      badge.className = 'comparison-badge';
      compText.textContent = 'Your footprint is below the global average of 4.8 tonnes. Great job — but there\'s always room to improve!';
    } else if (result.total <= 10) {
      badge.textContent = '⚠️ Above Global Average';
      badge.className = 'comparison-badge warning';
      compText.textContent = 'Your footprint is above the global average but below the US average. Small changes can make a big difference.';
    } else {
      badge.textContent = '🔴 High Footprint';
      badge.className = 'comparison-badge danger';
      compText.textContent = 'Your footprint is high. The good news? That means you have the most potential for impactful reduction.';
    }

    // Breakdown chips
    const breakdownEl = $('#results-breakdown');
    breakdownEl.innerHTML = '';

    const categories = [
      { label: 'Transport', value: result.transport, color: '#3B82F6' },
      { label: 'Energy', value: result.energy, color: '#F59E0B' },
      { label: 'Food', value: result.food, color: '#10B981' },
      { label: 'Lifestyle', value: result.lifestyle, color: '#8B5CF6' }
    ];

    categories.forEach(cat => {
      const chip = document.createElement('div');
      chip.className = 'result-chip';

      const dot = document.createElement('span');
      dot.className = 'result-chip-dot';
      dot.style.backgroundColor = cat.color;

      const text = document.createElement('span');
      text.textContent = cat.label + ': ' + cat.value.toFixed(1) + 't';

      chip.appendChild(dot);
      chip.appendChild(text);
      breakdownEl.appendChild(chip);
    });
  }

  /* ---- Dashboard Rendering ---- */

  function renderDashboard() {
    const state = AppState.get();
    const result = state.results;
    if (!result) return;

    // Hero score
    $('#dash-total-co2').textContent = result.total.toFixed(1);

    // Grade
    const gradeEl = $('#dash-grade');
    if (result.total <= 2.0) {
      gradeEl.textContent = '🌟 Exceptional';
      gradeEl.style.background = 'rgba(16,185,129,0.2)';
      gradeEl.style.color = '#34D399';
    } else if (result.total <= 4.8) {
      gradeEl.textContent = '✅ Below Average';
      gradeEl.style.background = 'rgba(16,185,129,0.15)';
      gradeEl.style.color = '#10B981';
    } else if (result.total <= 10) {
      gradeEl.textContent = '⚠️ Above Average';
      gradeEl.style.background = 'rgba(245,158,11,0.15)';
      gradeEl.style.color = '#F59E0B';
    } else {
      gradeEl.textContent = '🔴 High Impact';
      gradeEl.style.background = 'rgba(244,63,94,0.15)';
      gradeEl.style.color = '#F43F5E';
    }

    // Insight text
    const categories = [
      { label: 'Transport', value: result.transport },
      { label: 'Energy', value: result.energy },
      { label: 'Food', value: result.food },
      { label: 'Lifestyle', value: result.lifestyle }
    ];
    const sorted = [...categories].sort((a, b) => b.value - a.value);
    const highest = sorted[0];
    $('#dash-insight').textContent = 'Your highest category is ' + highest.label +
      ' at ' + highest.value.toFixed(1) + 't CO₂/yr. Focus your reduction efforts here for maximum impact.';

    // Comparison bars
    const maxVal = 16; // US average as baseline
    const userPct = Math.min((result.total / maxVal) * 100, 100);
    $('#comp-bar-user').style.width = userPct + '%';
    $('#comp-val-user').textContent = result.total.toFixed(1) + 't';

    // Donut chart
    renderDonutChart(result);

    // Breakdown cards
    renderBreakdownCards(result);

    // Line chart
    renderLineChart();

    // Insights
    renderInsights(result);

    // Update header stats
    updateHeaderStats();
  }

  function renderDonutChart(result) {
    const ctx = $('#donut-chart').getContext('2d');

    if (donutChart) donutChart.destroy();

    donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Transport', 'Energy', 'Food', 'Lifestyle'],
        datasets: [{
          data: [result.transport, result.energy, result.food, result.lifestyle],
          backgroundColor: ['#3B82F6', '#F59E0B', '#10B981', '#8B5CF6'],
          borderColor: 'rgba(10,15,26,0.8)',
          borderWidth: 3,
          hoverBorderColor: '#ffffff',
          hoverBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#9CA3AF',
              font: { family: 'Inter', size: 11, weight: '600' },
              padding: 16,
              usePointStyle: true,
              pointStyleWidth: 10
            }
          },
          tooltip: {
            backgroundColor: 'rgba(26,34,51,0.95)',
            titleColor: '#F9FAFB',
            bodyColor: '#9CA3AF',
            titleFont: { family: 'Space Grotesk', weight: '700' },
            bodyFont: { family: 'Inter' },
            borderColor: 'rgba(16,185,129,0.3)',
            borderWidth: 1,
            cornerRadius: 12,
            padding: 12,
            callbacks: {
              label: function(context) {
                const val = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = ((val / total) * 100).toFixed(1);
                return ' ' + context.label + ': ' + val.toFixed(2) + 't (' + pct + '%)';
              }
            }
          }
        },
        animation: {
          animateRotate: true,
          animateScale: true,
          duration: 1200,
          easing: 'easeOutQuart'
        }
      }
    });
  }

  function renderBreakdownCards(result) {
    const grid = $('#breakdown-grid');
    grid.innerHTML = '';

    const cats = [
      { key: 'transport', label: 'Transport', icon: 'car',          value: result.transport, color: '#3B82F6', bgColor: 'rgba(59,130,246,0.15)' },
      { key: 'energy',    label: 'Energy',    icon: 'zap',          value: result.energy,    color: '#F59E0B', bgColor: 'rgba(245,158,11,0.15)' },
      { key: 'food',      label: 'Food',      icon: 'apple',        value: result.food,      color: '#10B981', bgColor: 'rgba(16,185,129,0.15)' },
      { key: 'lifestyle', label: 'Lifestyle', icon: 'shopping-bag', value: result.lifestyle,  color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.15)' }
    ];

    const total = result.total || 1;

    cats.forEach(cat => {
      const pct = ((cat.value / total) * 100).toFixed(0);

      const card = document.createElement('div');
      card.className = 'breakdown-card';

      const iconWrap = document.createElement('div');
      iconWrap.className = 'breakdown-card-icon';
      iconWrap.style.background = cat.bgColor;
      iconWrap.style.color = cat.color;
      const iconEl = document.createElement('i');
      iconEl.setAttribute('data-lucide', cat.icon);
      iconWrap.appendChild(iconEl);

      const label = document.createElement('div');
      label.className = 'breakdown-card-label';
      label.textContent = cat.label;

      const value = document.createElement('div');
      value.className = 'breakdown-card-value';
      value.textContent = cat.value.toFixed(2) + 't';
      value.style.color = cat.color;

      const bar = document.createElement('div');
      bar.className = 'breakdown-card-bar';
      const barFill = document.createElement('div');
      barFill.className = 'breakdown-card-bar-fill';
      barFill.style.background = cat.color;
      barFill.style.width = '0%';
      bar.appendChild(barFill);

      const pctText = document.createElement('div');
      pctText.className = 'breakdown-card-pct';
      pctText.textContent = pct + '% of total';

      card.appendChild(iconWrap);
      card.appendChild(label);
      card.appendChild(value);
      card.appendChild(bar);
      card.appendChild(pctText);
      grid.appendChild(card);

      // Animate bar
      setTimeout(() => { barFill.style.width = pct + '%'; }, 300);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function renderLineChart() {
    const state = AppState.get();
    const history = state.history;

    const ctx = $('#line-chart').getContext('2d');

    if (lineChart) lineChart.destroy();

    // If only 1 entry, add a fake "start" point slightly higher
    let labels = history.map(h => h.date);
    let data = history.map(h => h.total);

    if (history.length === 0) {
      labels = ['No data'];
      data = [0];
    }

    lineChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'CO₂ (tonnes/yr)',
          data: data,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.1)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#10B981',
          pointBorderColor: '#0a0f1a',
          pointBorderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#6B7280', font: { family: 'Inter', size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              color: '#6B7280',
              font: { family: 'Inter', size: 11 },
              callback: (v) => v + 't'
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#9CA3AF',
              font: { family: 'Inter', size: 11, weight: '600' },
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(26,34,51,0.95)',
            titleColor: '#F9FAFB',
            bodyColor: '#9CA3AF',
            titleFont: { family: 'Space Grotesk', weight: '700' },
            bodyFont: { family: 'Inter' },
            borderColor: 'rgba(16,185,129,0.3)',
            borderWidth: 1,
            cornerRadius: 12,
            padding: 12
          }
        },
        animation: {
          duration: 1000,
          easing: 'easeOutQuart'
        }
      }
    });
  }

  function renderInsights(result) {
    const grid = $('#insights-grid');
    grid.innerHTML = '';

    const insights = generateInsights(result);

    insights.forEach(insight => {
      const card = document.createElement('div');
      card.className = 'insight-card';

      const header = document.createElement('div');
      header.className = 'insight-header';

      const iconWrap = document.createElement('div');
      iconWrap.className = 'insight-icon';
      iconWrap.style.background = insight.bgColor;
      iconWrap.style.color = insight.color;
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', insight.icon);
      iconWrap.appendChild(icon);

      const headerText = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'insight-title';
      title.textContent = insight.title;
      headerText.appendChild(title);

      if (insight.savings) {
        const savings = document.createElement('span');
        savings.className = 'insight-savings';
        savings.textContent = insight.savings;
        headerText.appendChild(savings);
      }

      header.appendChild(iconWrap);
      header.appendChild(headerText);

      const body = document.createElement('p');
      body.className = 'insight-body';
      body.textContent = insight.body;

      card.appendChild(header);
      card.appendChild(body);
      grid.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  function generateInsights(result) {
    const insights = [];

    // Transport insights
    if (result.transport > 3) {
      insights.push({
        icon: 'car', color: '#3B82F6', bgColor: 'rgba(59,130,246,0.15)',
        title: 'Reduce Driving',
        savings: 'Save up to ' + (result.transport * 0.3).toFixed(1) + 't',
        body: 'Your transport emissions are significant. Consider carpooling, public transit, or an EV. Even cutting driving by 30% would save ' + (result.transport * 0.3).toFixed(1) + ' tonnes annually.'
      });
    }

    if (result.breakdown && result.breakdown.flights > 1) {
      insights.push({
        icon: 'plane', color: '#3B82F6', bgColor: 'rgba(59,130,246,0.15)',
        title: 'Fly Less',
        savings: 'Save ' + result.breakdown.flights.toFixed(1) + 't',
        body: 'Flying is your most carbon-intensive activity per hour. Consider trains for shorter trips and video calls for meetings.'
      });
    }

    // Energy insights
    if (result.energy > 2) {
      insights.push({
        icon: 'zap', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.15)',
        title: 'Switch to Green Energy',
        savings: 'Save up to ' + (result.energy * 0.8).toFixed(1) + 't',
        body: 'Switching to a 100% renewable electricity tariff could eliminate up to 80% of your home energy emissions instantly.'
      });
    }

    // Food insights
    if (result.food > 2.5) {
      insights.push({
        icon: 'apple', color: '#10B981', bgColor: 'rgba(16,185,129,0.15)',
        title: 'Shift Your Diet',
        savings: 'Save up to ' + (result.food * 0.4).toFixed(1) + 't',
        body: 'Reducing meat intake, especially beef, is one of the most impactful individual actions. Try plant-based meals 3 days a week.'
      });
    }

    // Lifestyle insights
    if (result.lifestyle > 1) {
      insights.push({
        icon: 'shopping-bag', color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.15)',
        title: 'Buy Less, Choose Well',
        savings: 'Save up to ' + (result.lifestyle * 0.3).toFixed(1) + 't',
        body: 'Extending the life of your electronics and clothes by even one year significantly reduces their embedded carbon.'
      });
    }

    // Always show a positive general tip
    insights.push({
      icon: 'target', color: '#14B8A6', bgColor: 'rgba(20,184,166,0.15)',
      title: 'Paris 2030 Target: 2.0t',
      savings: result.total > 2 ? (result.total - 2).toFixed(1) + 't to go' : 'You\'re there!',
      body: result.total > 2
        ? 'You need to reduce by ' + (result.total - 2).toFixed(1) + ' tonnes to meet the Paris target. Use the Action Hub to start your pledges.'
        : 'Amazing! You\'re already at or below the Paris 2030 per-capita target. Keep inspiring others!'
    });

    return insights;
  }

  /* ---- Action Hub ---- */

  function renderActionHub() {
    const state = AppState.get();

    // Level info
    const levelData = AppState.computeLevel(state.xp);
    const nextXP = AppState.xpForNextLevel(state.xp);

    $('#level-badge-lg').querySelector('span').textContent = levelData.level;
    $('#level-title-text').textContent = levelData.title;
    $('#xp-current').textContent = state.xp;
    $('#xp-next').textContent = nextXP;

    const xpPct = levelData.xpRequired === nextXP
      ? 100
      : ((state.xp - levelData.xpRequired) / (nextXP - levelData.xpRequired)) * 100;
    $('#xp-bar').style.width = Math.min(xpPct, 100) + '%';

    // Streak
    $('#streak-number').textContent = state.streak;

    // Badges
    renderBadges();

    // Challenges
    renderChallenges();

    // Update header
    updateHeaderStats();
  }

  function renderBadges() {
    const grid = $('#badges-grid');
    grid.innerHTML = '';
    const state = AppState.get();

    CarbonDatabase.BADGES.forEach(badge => {
      const isUnlocked = state.unlockedBadges.includes(badge.id);

      const item = document.createElement('div');
      item.className = 'badge-item ' + (isUnlocked ? 'unlocked' : 'locked');

      const emoji = document.createElement('div');
      emoji.className = 'badge-emoji';
      emoji.textContent = badge.emoji;
      emoji.setAttribute('aria-hidden', 'true');

      const name = document.createElement('div');
      name.className = 'badge-name';
      name.textContent = badge.name;

      const desc = document.createElement('div');
      desc.className = 'badge-desc';
      desc.textContent = isUnlocked ? '✓ Unlocked' : badge.desc;

      item.appendChild(emoji);
      item.appendChild(name);
      item.appendChild(desc);
      grid.appendChild(item);
    });
  }

  function renderChallenges() {
    const list = $('#challenges-list');
    list.innerHTML = '';
    const state = AppState.get();

    let activeCount = 0;

    CarbonDatabase.CHALLENGES.forEach(ch => {
      const isActive = state.activePledges.includes(ch.id);
      const isCompleted = state.completedChallenges.includes(ch.id);
      if (isActive) activeCount++;

      const card = document.createElement('div');
      card.className = 'challenge-card';
      if (isActive) card.classList.add('active-pledge');
      if (isCompleted && !isActive) card.classList.add('completed-pledge');

      const iconEl = document.createElement('div');
      iconEl.className = 'challenge-icon';
      iconEl.textContent = ch.emoji;
      iconEl.setAttribute('aria-hidden', 'true');

      const info = document.createElement('div');
      info.className = 'challenge-info';

      const title = document.createElement('div');
      title.className = 'challenge-title';
      title.textContent = ch.title;

      const desc = document.createElement('div');
      desc.className = 'challenge-desc';
      desc.textContent = ch.desc;

      const meta = document.createElement('div');
      meta.className = 'challenge-meta';

      const xpBadge = document.createElement('span');
      xpBadge.className = 'challenge-xp';
      xpBadge.textContent = '+' + ch.xp + ' XP';

      const reduction = document.createElement('span');
      reduction.className = 'challenge-reduction';
      reduction.textContent = '↓ ' + ch.reduction;

      meta.appendChild(xpBadge);
      meta.appendChild(reduction);
      info.appendChild(title);
      info.appendChild(desc);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'challenge-actions';

      if (isCompleted && !isActive) {
        const doneBtn = document.createElement('button');
        doneBtn.className = 'btn btn-ghost btn-sm';
        doneBtn.textContent = '✓ Done';
        doneBtn.disabled = true;
        actions.appendChild(doneBtn);
      } else if (isActive) {
        const completeBtn = document.createElement('button');
        completeBtn.className = 'btn btn-primary btn-sm';
        completeBtn.textContent = 'Complete ✓';
        completeBtn.addEventListener('click', () => completeChallenge(ch));
        actions.appendChild(completeBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-ghost btn-sm';
        cancelBtn.textContent = 'Drop';
        cancelBtn.addEventListener('click', () => dropChallenge(ch.id));
        actions.appendChild(cancelBtn);
      } else {
        const pledgeBtn = document.createElement('button');
        pledgeBtn.className = 'btn btn-primary btn-sm';
        pledgeBtn.textContent = 'Pledge';
        pledgeBtn.addEventListener('click', () => activateChallenge(ch.id));
        actions.appendChild(pledgeBtn);
      }

      card.appendChild(iconEl);
      card.appendChild(info);
      card.appendChild(actions);
      list.appendChild(card);
    });

    $('#active-challenge-count').textContent = activeCount + ' active';
  }

  function activateChallenge(id) {
    const state = AppState.get();
    if (!state.activePledges.includes(id)) {
      state.activePledges.push(id);
      AppState.update({ activePledges: state.activePledges });
    }
    renderChallenges();
    updateHeaderStats();
  }

  function dropChallenge(id) {
    const state = AppState.get();
    AppState.update({
      activePledges: state.activePledges.filter(p => p !== id)
    });
    renderChallenges();
  }

  function completeChallenge(challenge) {
    const state = AppState.get();
    const newXP = state.xp + challenge.xp;
    const oldLevel = AppState.computeLevel(state.xp);
    const newLevel = AppState.computeLevel(newXP);

    // Update streak
    const today = new Date().toISOString().split('T')[0];
    let newStreak = state.streak;
    if (state.lastCheckInDate !== today) {
      // Check if yesterday was the last check-in
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      newStreak = (state.lastCheckInDate === yesterday) ? state.streak + 1 : 1;
    }

    const completed = [...state.completedChallenges];
    if (!completed.includes(challenge.id)) {
      completed.push(challenge.id);
    }

    AppState.update({
      xp: newXP,
      level: newLevel.level,
      streak: newStreak,
      lastCheckInDate: today,
      activePledges: state.activePledges.filter(p => p !== challenge.id),
      completedChallenges: completed
    });

    // Re-render
    renderActionHub();

    // Level up?
    if (newLevel.level > oldLevel.level) {
      showLevelUpModal(newLevel);
    }

    // Check badges
    checkBadges();
  }

  function checkBadges() {
    const state = AppState.get();
    let newBadgeUnlocked = null;

    CarbonDatabase.BADGES.forEach(badge => {
      if (!state.unlockedBadges.includes(badge.id) && badge.condition(state)) {
        state.unlockedBadges.push(badge.id);
        newBadgeUnlocked = badge;
      }
    });

    if (newBadgeUnlocked) {
      AppState.update({ unlockedBadges: state.unlockedBadges });
      renderBadges();
      showBadgeModal(newBadgeUnlocked);
    }
  }

  function updateHeaderStats() {
    const state = AppState.get();
    $('#header-streak').textContent = state.streak;
    $('#header-xp').textContent = state.xp;
    $('#header-level').textContent = AppState.computeLevel(state.xp).level;
  }

  /* ---- Modals ---- */

  function showLevelUpModal(levelData) {
    $('#levelup-text').textContent =
      'You reached Level ' + levelData.level + ' — ' + levelData.title + '! Keep up the amazing eco-efforts!';
    openModal('levelup-modal');
  }

  function showBadgeModal(badge) {
    $('#badge-modal-icon').textContent = badge.emoji;
    $('#badge-modal-title').textContent = 'Badge Unlocked!';
    $('#badge-modal-text').textContent = badge.name + ' — ' + badge.desc;
    // Delay slightly if level-up is showing
    setTimeout(() => openModal('badge-modal'), 600);
  }

  function openModal(id) {
    const modal = $('#' + id);
    modal.removeAttribute('hidden');
    // Focus the close button
    const closeBtn = modal.querySelector('.btn');
    if (closeBtn) setTimeout(() => closeBtn.focus(), 100);
  }

  function closeModal(id) {
    const modal = $('#' + id);
    if (modal) modal.setAttribute('hidden', '');
  }

  /* ---- Tab Switching ---- */

  function switchTab(tabName) {
    $$('.tab-btn').forEach(btn => {
      const isActive = btn.dataset.tab === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    $$('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'tab-' + tabName);
    });
  }

  /* ---- Simulate Progress ---- */

  function simulateProgress() {
    const state = AppState.get();
    if (!state.results) return;

    const currentTotal = state.results.total;
    const history = [...state.history];

    // Generate 5 simulated future entries with gradual reduction
    for (let i = 1; i <= 5; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() + i);
      const reduction = 1 - (i * 0.06); // 6% reduction per month
      history.push({
        date: date.toISOString().split('T')[0],
        total: Math.max(currentTotal * reduction, 0.5).toFixed(2) * 1,
        transport: (state.results.transport * reduction).toFixed(2) * 1,
        energy: (state.results.energy * reduction).toFixed(2) * 1,
        food: (state.results.food * reduction).toFixed(2) * 1,
        lifestyle: (state.results.lifestyle * reduction).toFixed(2) * 1
      });
    }

    // Keep last 20
    while (history.length > 20) history.shift();

    AppState.update({ history });
    renderLineChart();
  }

  /* ---- Carbon Search ---- */

  function performCarbonSearch() {
    const query = $('#carbon-search-input').value.trim().toLowerCase();
    const resultsEl = $('#search-results');
    resultsEl.innerHTML = '';

    if (!query) return;

    // Update search count for badge
    const state = AppState.get();
    AppState.update({ searchCount: state.searchCount + 1 });
    checkBadges();

    // Search items
    const matches = CarbonDatabase.ITEMS.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.desc.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
      const noResult = document.createElement('div');
      noResult.className = 'search-no-result';
      noResult.textContent = 'No results found for "' + query + '". Try searching for common items like "coffee", "jeans", or "flight".';
      resultsEl.appendChild(noResult);
      return;
    }

    matches.forEach(item => {
      const el = document.createElement('div');
      el.className = 'search-result-item';

      const icon = document.createElement('div');
      icon.className = 'search-result-icon';
      icon.textContent = item.icon;
      icon.setAttribute('aria-hidden', 'true');

      const info = document.createElement('div');
      info.className = 'search-result-info';

      const name = document.createElement('div');
      name.className = 'search-result-name';
      name.textContent = item.name;

      const desc = document.createElement('div');
      desc.className = 'search-result-desc';
      desc.textContent = item.desc + ' · ' + item.unit;

      info.appendChild(name);
      info.appendChild(desc);

      const co2 = document.createElement('div');
      co2.className = 'search-result-co2';
      co2.textContent = formatCO2(item.co2);

      el.appendChild(icon);
      el.appendChild(info);
      el.appendChild(co2);
      resultsEl.appendChild(el);
    });
  }

  function formatCO2(kg) {
    if (kg >= 1000) return (kg / 1000).toFixed(1) + 't';
    if (kg >= 1) return kg.toFixed(1) + ' kg';
    return (kg * 1000).toFixed(0) + ' g';
  }

  /* ---- Learn Tab ---- */

  function renderLearnTab() {
    const accordion = $('#tips-accordion');
    accordion.innerHTML = '';

    CarbonDatabase.TIPS.forEach((tip, index) => {
      const item = document.createElement('div');
      item.className = 'tip-item';

      const header = document.createElement('button');
      header.className = 'tip-header';
      header.setAttribute('aria-expanded', 'false');
      header.setAttribute('aria-controls', 'tip-body-' + index);
      header.id = 'tip-header-' + index;

      const emoji = document.createElement('span');
      emoji.className = 'tip-emoji';
      emoji.textContent = tip.emoji;

      const title = document.createElement('span');
      title.className = 'tip-title';
      title.textContent = tip.title;

      const category = document.createElement('span');
      category.className = 'tip-category';
      category.textContent = tip.category;
      category.style.background = tip.categoryColor + '22';
      category.style.color = tip.categoryColor;

      const chevron = document.createElement('span');
      chevron.className = 'tip-chevron';
      chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';

      header.appendChild(emoji);
      header.appendChild(title);
      header.appendChild(category);
      header.appendChild(chevron);

      const body = document.createElement('div');
      body.className = 'tip-body';
      body.id = 'tip-body-' + index;
      body.setAttribute('role', 'region');
      body.setAttribute('aria-labelledby', 'tip-header-' + index);

      const bodyText = document.createElement('p');
      bodyText.textContent = tip.body;
      body.appendChild(bodyText);

      if (tip.bullets && tip.bullets.length > 0) {
        const ul = document.createElement('ul');
        tip.bullets.forEach(b => {
          const li = document.createElement('li');
          li.textContent = b;
          ul.appendChild(li);
        });
        body.appendChild(ul);
      }

      if (tip.impact) {
        const impact = document.createElement('div');
        impact.className = 'tip-impact';
        impact.textContent = '🌿 ' + tip.impact;
        body.appendChild(impact);
      }

      header.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        // Close all others
        $$('.tip-item').forEach(i => {
          i.classList.remove('open');
          const h = i.querySelector('.tip-header');
          if (h) h.setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('open');
          header.setAttribute('aria-expanded', 'true');
        }
      });

      item.appendChild(header);
      item.appendChild(body);
      accordion.appendChild(item);
    });
  }

  /* ---- Offset Tab ---- */

  function renderOffsetTab() {
    // Pre-fill offset input
    const state = AppState.get();
    if (state.results) {
      $('#offset-co2-input').value = state.results.total;
    }

    // Render offset methods
    const grid = $('#offset-methods-grid');
    grid.innerHTML = '';

    CarbonDatabase.OFFSET_METHODS.forEach(method => {
      const card = document.createElement('div');
      card.className = 'offset-method-card';

      const icon = document.createElement('div');
      icon.className = 'offset-method-icon';
      icon.textContent = method.icon;
      icon.setAttribute('aria-hidden', 'true');

      const title = document.createElement('div');
      title.className = 'offset-method-title';
      title.textContent = method.title;

      const desc = document.createElement('div');
      desc.className = 'offset-method-desc';
      desc.textContent = method.desc;

      const factor = document.createElement('div');
      factor.className = 'offset-method-factor';
      factor.textContent = method.factor;

      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(factor);
      grid.appendChild(card);
    });
  }

  function performOffsetCalc() {
    const tonnes = parseFloat($('#offset-co2-input').value) || 0;
    const years = parseInt($('#offset-years').value) || 1;

    if (tonnes <= 0) return;

    const result = CarbonCalculator.calculateOffset(tonnes, years);
    const container = $('#offset-results');
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'offset-result-grid';

    const cards = [
      { icon: '🌳', label: 'Trees Needed', value: result.trees.toLocaleString(), sub: 'over ' + years + ' year(s)' },
      { icon: '☀️', label: 'Solar Panels', value: result.solarPanels.toLocaleString(), sub: 'lifetime offset equivalent' },
      { icon: '💨', label: 'Carbon Credits', value: result.windCredits.toLocaleString(), sub: '1 credit = 1 tonne CO₂' },
      { icon: '💰', label: 'Est. Cost Range', value: '$' + result.costLow.toLocaleString() + ' – $' + result.costHigh.toLocaleString(), sub: 'voluntary carbon market' },
      { icon: '📊', label: 'Total CO₂ to Offset', value: result.totalCO2 + 't', sub: tonnes + 't × ' + years + ' years' }
    ];

    cards.forEach(c => {
      const card = document.createElement('div');
      card.className = 'offset-result-card';

      const icon = document.createElement('div');
      icon.className = 'offset-result-icon';
      icon.textContent = c.icon;
      icon.setAttribute('aria-hidden', 'true');

      const label = document.createElement('div');
      label.className = 'offset-result-label';
      label.textContent = c.label;

      const value = document.createElement('div');
      value.className = 'offset-result-value';
      value.textContent = c.value;

      const sub = document.createElement('div');
      sub.className = 'offset-result-sub';
      sub.textContent = c.sub;

      card.appendChild(icon);
      card.appendChild(label);
      card.appendChild(value);
      card.appendChild(sub);
      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  /* ---- Utility ---- */

  function animateNumber(el, start, end, duration) {
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      el.textContent = current.toFixed(1);
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /* ---- Boot ---- */
  document.addEventListener('DOMContentLoaded', init);

  return { showScreen, renderDashboard, renderActionHub, renderLearnTab, renderOffsetTab };
})();
