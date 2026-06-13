/**
 * EcoPulse - Carbon Footprint Tracker Application Logic
 * Implements: Calculations Engine, State Manager, UI Renderers, Chart Controllers, and Accessibility Handlers.
 */

// ==========================================
// 1. Carbon Calculation Constants & Engine
// ==========================================
const CarbonCalculator = {
  // Emission constants (units in kg CO2 per specified unit)
  EMISSION_FACTORS: {
    transport: {
      petrol: 0.404,  // kg CO2 per mile (US EPA average passenger vehicle)
      diesel: 0.450,  // kg CO2 per mile
      electric: 0.110, // kg CO2 per mile (indirect grid charging average)
      none: 0.0,      // kg CO2
      transit: 0.060,  // kg CO2 per hour of public commuting (bus/train average)
      flight: 1100.0   // kg CO2 per average trip (mix short/long haul)
    },
    energy: {
      electricityCostPerKWh: 0.16, // average cost per kWh in USD
      electricityCO2PerKWh: 0.400, // kg CO2 per kWh
      gasCostPerTherm: 1.20,       // average cost per therm in USD
      gasCO2PerTherm: 5.300        // kg CO2 per therm (domestic gas heating)
    },
    diet: {
      mixed: 2800.0,       // kg CO2 per year
      lowmeat: 2000.0,     // kg CO2 per year
      vegetarian: 1400.0,   // kg CO2 per year
      vegan: 900.0         // kg CO2 per year
    },
    consumption: {
      shopping: [0, 200.0, 500.0, 1200.0, 2200.0], // mapping: level 1-4 shopping kg CO2 per year
      waste: [0, -100.0, 300.0, 800.0]            // mapping: level 1-3 food waste kg CO2 per year
    },
    sorting: {
      none: 0.0,
      partial: -300.0, // recycling reduces total landfill waste footprint (kg CO2 per year)
      strict: -600.0
    }
  },

  /**
   * Main calculation engine converting input parameters to tonnes CO2e
   * @param {Object} inputs Form values from wizard
   * @returns {Object} Structured categories breakdown & total
   */
  calculate: function(inputs) {
    const factors = this.EMISSION_FACTORS;
    
    // -- TRANSPORT --
    const weeklyMiles = Number(inputs.distance) || 0;
    const vehicleType = inputs.vehicleType || 'petrol';
    const vehicleRate = factors.transport[vehicleType] || 0;
    const vehicleEmissions = (weeklyMiles * 52) * vehicleRate; // annual vehicle emissions in kg
    
    const transitHours = Number(inputs.transit) || 0;
    const transitEmissions = (transitHours * 52) * factors.transport.transit;
    
    const annualFlights = Number(inputs.flights) || 0;
    const flightEmissions = annualFlights * factors.transport.flight;
    
    const totalTransport = (vehicleEmissions + transitEmissions + flightEmissions) / 1000; // to tonnes

    // -- HOME ENERGY --
    const elecBill = Number(inputs.electricity) || 0;
    const gasBill = Number(inputs.gas) || 0;
    const greenPercent = Number(inputs.greenPercent) || 0;

    const annualElecKWh = (elecBill * 12) / factors.energy.electricityCostPerKWh;
    const baseElecEmissions = annualElecKWh * factors.energy.electricityCO2PerKWh;
    // Green power offset
    const elecEmissions = baseElecEmissions * (1 - (greenPercent / 100));

    const annualGasTherms = (gasBill * 12) / factors.energy.gasCostPerTherm;
    const gasEmissions = annualGasTherms * factors.energy.gasCO2PerTherm;

    const totalEnergy = (elecEmissions + gasEmissions) / 1000; // to tonnes

    // -- DIET & LIFESTYLE --
    const dietType = inputs.dietType || 'mixed';
    const dietEmissions = factors.diet[dietType] || factors.diet.mixed;

    const shoppingIndex = Number(inputs.shopping) || 2;
    const shoppingEmissions = factors.consumption.shopping[shoppingIndex] || 500.0;

    const wasteIndex = Number(inputs.foodwaste) || 2;
    const wasteEmissions = factors.consumption.waste[wasteIndex] || 300.0;

    const totalDietLifestyle = (dietEmissions + shoppingEmissions + wasteEmissions) / 1000; // to tonnes

    // -- WASTE SORTING --
    const sortingType = inputs.sortingLevel || 'partial';
    const wasteOffset = (factors.sorting[sortingType] || 0) / 1000; // to tonnes (negative offset)

    // Total Calculation (with a floor of 0.1 tonnes to prevent absolute zero profiles)
    let total = totalTransport + totalEnergy + totalDietLifestyle + wasteOffset;
    total = Math.max(0.1, total);

    return {
      transport: parseFloat(totalTransport.toFixed(2)),
      energy: parseFloat(totalEnergy.toFixed(2)),
      dietLifestyle: parseFloat((totalDietLifestyle + wasteOffset).toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };
  }
};

// ==========================================
// 2. Application State Manager
// ==========================================
const AppState = {
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

// ==========================================
// 3. Static Datasets (Pledges, Search & Edu)
// ==========================================
const PledgeLibrary = [
  { id: 'p_bike', category: 'transport', title: 'Bike to Commute', co2: 4.2, xp: 15, desc: 'Avoid using vehicles for your commute. Ride a bike or walk.' },
  { id: 'p_transit', category: 'transport', title: 'Ride Public Transit', co2: 3.1, xp: 12, desc: 'Ditch your personal passenger vehicle for bus or metro rails.' },
  { id: 'p_carpool', category: 'transport', title: 'Carpool with Coworkers', co2: 2.0, xp: 10, desc: 'Share your vehicle ride to reduce average personal trip emissions.' },
  
  { id: 'p_coldwash', category: 'energy', title: 'Cold Water Washing', co2: 1.2, xp: 10, desc: 'Run laundry machines with cold cycles to avoid heating energy.' },
  { id: 'p_leds', category: 'energy', title: 'Install LED Bulbs', co2: 1.8, xp: 15, desc: 'Replace standard fluorescent lamps with low-power LEDs.' },
  { id: 'p_thermostat', category: 'energy', title: 'Thermostat Offset (-1°C)', co2: 2.5, xp: 12, desc: 'Lower heating/increase cooling by 1°C to optimize HVAC bills.' },
  
  { id: 'p_vegan', category: 'diet', title: 'Vegan Diet Day', co2: 5.2, xp: 20, desc: 'Avoid meat, dairy, and eggs entirely for a full calendar day.' },
  { id: 'p_meatless', category: 'diet', title: 'Meatless Monday', co2: 3.5, xp: 15, desc: 'Swap beef/poultry for high-protein vegetarian alternatives.' },
  { id: 'p_zerowaste', category: 'diet', title: 'Zero Food Waste Day', co2: 1.5, xp: 10, desc: 'Plan meals thoroughly to produce zero landfill food garbage.' },
  { id: 'p_sort', category: 'diet', title: 'Meticulous Sorting', co2: 1.0, xp: 8, desc: 'Carefully sort plastic, paper, organic compost, and glass.' }
];

const BadgesLibrary = [
  { id: 'b_calc', title: 'Self-Aware', desc: 'Conduct your first carbon footprint audit.', requirement: (s) => s.hasCalculated },
  { id: 'b_level2', title: 'Eco-Pilot', desc: 'Reach level 2 by taking action.', requirement: (s) => s.level >= 2 },
  { id: 'b_level5', title: 'Sustainability Sage', desc: 'Reach level 5.', requirement: (s) => s.level >= 5 },
  { id: 'b_pledge3', title: 'Eco-Warrior', desc: 'Commit to 3 active pledges.', requirement: (s) => s.pledges.length >= 3 },
  { id: 'b_offset', title: 'Carbon Neutralizer', desc: 'Mitigate emissions via offsetting.', requirement: (s) => s.lockedOffsets > 0 },
  { id: 'b_streak5', title: 'Consistent Guardian', desc: 'Achieve a 5-day action streak.', requirement: (s) => s.streak >= 5 }
];

const FoodprintIndex = {
  'beef': { val: 27.0, desc: 'kg CO₂e per kg. Extremely carbon-heavy due to methane emissions and land clearances.' },
  'lamb': { val: 23.0, desc: 'kg CO₂e per kg. Ruminant livestock release high rates of methane gas.' },
  'cheese': { val: 12.0, desc: 'kg CO₂e per kg. Dairy processing and milk supply chains require massive energy.' },
  'pork': { val: 7.2, desc: 'kg CO₂e per kg. Moderate emissions, lower than beef but higher than poultry.' },
  'chicken': { val: 5.0, desc: 'kg CO₂e per kg. Standard poultry has moderate grain farming carbon costs.' },
  'fish': { val: 6.0, desc: 'kg CO₂e per kg (farmed). Transportation and refrigeration form core emissions.' },
  'eggs': { val: 4.8, desc: 'kg CO₂e per kg. High density poultry feeding systems generate moderate footprints.' },
  'rice': { val: 2.7, desc: 'kg CO₂e per kg. Flooded rice paddies support methane-producing bacteria.' },
  'tofu': { val: 2.0, desc: 'kg CO₂e per kg. Plant protein from soybeans has very low emissions.' },
  'milk': { val: 1.9, desc: 'kg CO₂e per liter (dairy). Pasture emissions and factory processing cost.' },
  'oat milk': { val: 0.4, desc: 'kg CO₂e per liter. Vegan milks require fraction of land and water.' },
  'coffee': { val: 0.3, desc: 'kg CO₂e per average cup. Logistics, roasting, and dairy additives contribution.' },
  'avocado': { val: 0.8, desc: 'kg CO₂e per piece. High irrigation needs and overseas flight transit logistics.' },
  'banana': { val: 0.4, desc: 'kg CO₂e per kg. Requires long distance shipping but very efficient growth.' },
  'plastic bottle': { val: 0.1, desc: 'kg CO₂e per unit. Production from fossil fuel petroleum polymers.' },
  'paper bag': { val: 0.05, desc: 'kg CO₂e per bag. High logging and paper milling manufacturing costs.' },
  't-shirt': { val: 7.0, desc: 'kg CO₂e per piece. Cotton agricultural supply, weaving, and textile dyeing.' },
  'jeans': { val: 16.0, desc: 'kg CO₂e per pair. Requires extensive weaving, stone washing, and shipping.' },
  'laptop': { val: 320.0, desc: 'kg CO₂e per device. Industrial silicon refining and electronics clean rooms.' },
  'smartphone': { val: 65.0, desc: 'kg CO₂e per device. Massive carbon emitted during rare earth minerals mining.' },
  'flight nyc to london': { val: 920.0, desc: 'kg CO₂e per passenger (one way). Heavy high-altitude aviation jetfuel combustion.' },
  'streaming 1hr': { val: 0.05, desc: 'kg CO₂e per hour. Remote network server grids and router infrastructure.' },
  'email': { val: 0.02, desc: 'kg CO₂e (with large attachment). Remote server caching and power transmission.' },
  'gas driving 1mi': { val: 0.4, desc: 'kg CO₂e per mile. Internal combustion engine petroleum fuel waste.' }
};

const EducationalArticles = [
  {
    title: 'Demystifying the Carbon Budget',
    blocks: [
      { type: 'p', text: 'A carbon budget is the cumulative amount of carbon dioxide emissions permitted over a period of time to keep global temperature increases within a safe threshold (like the 1.5°C Paris goal).' },
      { type: 'p', text: 'Currently, the average global citizen has an annual carbon footprint of approximately 4.5 tonnes, whereas standard models suggest that limit must decrease to 2.0 tonnes per citizen by 2030 to prevent catastrophic temperature shifts.' }
    ]
  },
  {
    title: 'Decarbonizing Domestic Energy',
    blocks: [
      { type: 'p', text: 'Household electricity heating and cooling comprise nearly 30% of average household carbon footprints. Actions include:' },
      { type: 'li', text: 'Switch to Renewables: Green grid tariffs source energy from wind and solar, dropping footprint directly.' },
      { type: 'li', text: 'Unplug Vampires: Idle appliances consume standby power. Unplugging them can reduce emissions by 100kg CO₂ annually.' },
      { type: 'li', text: 'Adjust Thermostats: Reducing thermostat settings by 1°C in winter can shave up to 10% off heating gas bills.' }
    ]
  },
  {
    title: 'The Environmental Food Chain',
    blocks: [
      { type: 'p', text: 'Ruminant livestock (like beef and lamb) require massive amounts of land and feed water. More critically, their digestive processes release large volumes of methane, a greenhouse gas with 28 times the heat-trapping capability of carbon dioxide over a 100-year timescale.' },
      { type: 'p', text: 'Shifting even two dinners a week to low-carbon grains or soy alternatives yields greater emissions reductions than driving a fuel-efficient hybrid.' }
    ]
  }
];

// ==========================================
// 4. Main Controller & Router
// ==========================================
const App = {
  charts: {}, // holds chart instances

  init: function() {
    AppState.load();
    this.updateUserProgressUI();
    this.checkStreakLogic();
    
    // Router logic: load calculator panel if first run, else load dashboard
    if (!AppState.data.hasCalculated) {
      this.switchPanel('welcome');
    } else {
      this.switchPanel('dashboard');
    }

    // Set up Global Listeners
    this.registerGlobalListeners();
    
    // Render dynamic components
    PledgeManager.renderPledges();
    PledgeManager.renderBadges();
    SearchEngine.init();
    EducationalFeed.init();
    OffsetSimulator.init();
  },

  registerGlobalListeners: function() {
    // Escape key listeners for modals to maintain accessibility
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        CalculatorWizard.closeModal();
        this.closeLevelUpModal();
      }
    });
  },

  switchPanel: function(panelId) {
    // Hide all panels
    const panels = document.querySelectorAll('.app-panel');
    panels.forEach(p => p.classList.remove('active'));

    // De-activate all sidebar buttons
    const sidebarItems = document.querySelectorAll('.sidebar-menu .menu-item');
    sidebarItems.forEach(item => item.classList.remove('active'));
    sidebarItems.forEach(item => {
      const btn = item.querySelector('button');
      if (btn) btn.setAttribute('aria-selected', 'false');
    });

    // Handle panels
    let targetPanel = document.getElementById(`panel-${panelId}`);
    if (!targetPanel) return;

    targetPanel.classList.add('active');
    
    // Focus panel for accessibility reading
    targetPanel.setAttribute('tabindex', '-1');
    targetPanel.focus();

    // Mark sidebar navigation item active
    const menuEl = document.getElementById(`menu-${panelId}`);
    if (menuEl) {
      menuEl.classList.add('active');
      const btn = menuEl.querySelector('button');
      if (btn) btn.setAttribute('aria-selected', 'true');
    }

    // Custom view initializations
    if (panelId === 'dashboard') {
      this.renderDashboardData();
    }
  },

  updateUserProgressUI: function() {
    const levelDisplay = document.getElementById('user-level-display');
    const xpDisplay = document.getElementById('user-xp-display');
    const xpProgressBar = document.getElementById('xp-progressbar');
    const xpBarFill = document.getElementById('xp-bar-fill');
    const streakDisplay = document.getElementById('streak-count-val');
    const co2SavedDisplay = document.getElementById('co2-saved-display');
    
    const xpLevelMin = (AppState.data.level - 1) * 100;
    const xpInLevel = AppState.data.xp - xpLevelMin;
    const levelPercent = Math.min(100, Math.max(0, xpInLevel));

    if (levelDisplay) levelDisplay.textContent = `Lvl ${AppState.data.level} ${AppState.data.levelName}`;
    if (xpDisplay) xpDisplay.textContent = `${AppState.data.xp} / ${AppState.data.level * 100} XP`;
    
    if (xpProgressBar) {
      xpProgressBar.setAttribute('aria-valuenow', xpInLevel);
      xpProgressBar.setAttribute('aria-valuemax', 100);
    }
    if (xpBarFill) {
      xpBarFill.style.width = `${levelPercent}%`;
    }

    if (streakDisplay) streakDisplay.textContent = AppState.data.streak;
    
    // Compute total co2 saved
    let totalSaved = 0;
    // Add up history offsets/pledges
    totalSaved += AppState.data.lockedOffsets * 1000; // tonnes to kg
    // Pledges saved
    AppState.data.completedToday.forEach(pid => {
      const pl = PledgeLibrary.find(x => x.id === pid);
      if (pl) totalSaved += pl.co2;
    });

    if (co2SavedDisplay) co2SavedDisplay.textContent = totalSaved.toFixed(1);
    
    // Update streak label in Pledges page
    const streakBarDisplay = document.getElementById('streak-bar-display');
    if (streakBarDisplay) {
      streakBarDisplay.textContent = `Streak: ${AppState.data.streak} Days`;
    }
  },

  checkStreakLogic: function() {
    const todayStr = new Date().toDateString();
    const lastActiveStr = AppState.data.lastActiveDate;

    if (!lastActiveStr) {
      AppState.data.streak = 0;
    } else {
      const today = new Date(todayStr);
      const lastActive = new Date(lastActiveStr);
      const diffTime = Math.abs(today - lastActive);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Daily streak continues
        // (will increment once user performs a check-in action)
      } else if (diffDays > 1) {
        // Streak broken
        AppState.data.streak = 0;
      }
    }
    AppState.save();
  },

  incrementStreak: function() {
    const todayStr = new Date().toDateString();
    if (AppState.data.lastActiveDate !== todayStr) {
      AppState.data.streak += 1;
      AppState.data.lastActiveDate = todayStr;
      AppState.save();
      this.updateUserProgressUI();
      PledgeManager.renderBadges(); // reevaluate badges
    }
  },

  renderDashboardData: function() {
    if (!AppState.data.hasCalculated) return;

    const net = Math.max(0, AppState.data.breakdown.total - AppState.data.lockedOffsets);
    
    // Core values
    document.getElementById('dash-footprint-val').textContent = AppState.data.breakdown.total.toFixed(2);
    document.getElementById('dash-offset-val').textContent = AppState.data.lockedOffsets.toFixed(2);
    document.getElementById('dash-net-val').textContent = net.toFixed(2);

    // Comparer values
    document.getElementById('comparison-user-val').textContent = `${net.toFixed(1)} tonnes`;
    const percentWidth = Math.min(100, (net / 16.0) * 100);
    document.getElementById('comparison-user-bar').style.width = `${percentWidth}%`;

    // Dynamic Insights Cards
    this.generateInsightsList(AppState.data.breakdown);

    // Render Charts
    this.renderCharts(AppState.data.breakdown);
  },

  generateInsightsList: function(breakdown) {
    const listContainer = document.getElementById('dashboard-insights-list');
    if (!listContainer) return;

    // Clear list securely
    listContainer.textContent = '';

    const categories = [
      { name: 'Transport', val: breakdown.transport, id: 'transport' },
      { name: 'Home Energy', val: breakdown.energy, id: 'energy' },
      { name: 'Lifestyle/Diet', val: breakdown.dietLifestyle, id: 'diet' }
    ];

    // Sort descending
    categories.sort((a, b) => b.val - a.val);
    const highest = categories[0];
    const net = Math.max(0, breakdown.total - AppState.data.lockedOffsets);

    // 1. Highest emitting insight
    const mainInsight = document.createElement('div');
    mainInsight.className = 'insight-card warning';
    
    const warnIconDiv = document.createElement('div');
    warnIconDiv.className = 'insight-icon warning';
    const warnIcon = document.createElement('i');
    warnIcon.setAttribute('data-lucide', 'alert-triangle');
    warnIcon.style.width = '20px';
    warnIcon.style.height = '20px';
    warnIconDiv.appendChild(warnIcon);
    mainInsight.appendChild(warnIconDiv);

    const warnContent = document.createElement('div');
    warnContent.className = 'insight-content';
    
    const warnTitle = document.createElement('h4');
    warnTitle.textContent = `Highest Output: ${highest.name}`;
    warnContent.appendChild(warnTitle);

    const warnText = document.createElement('p');
    if (highest.id === 'transport') {
      warnText.textContent = `Your transportation sector emits ${highest.val} tonnes annually. Consider pledging to walk/bike short commutes, carpooling, or decreasing flight intervals to drastically cut emissions.`;
    } else if (highest.id === 'energy') {
      warnText.textContent = `Domestic energy usage contributes ${highest.val} tonnes CO₂e. Try signing up for a green grid supplier option, implementing home solar, or dropping utility thermostats.`;
    } else {
      warnText.textContent = `Diet and consumption styles represent ${highest.val} tonnes. Reducing beef consumption, implementing veggie check-ins, or sorting landfill waste mitigates output.`;
    }
    warnContent.appendChild(warnText);
    mainInsight.appendChild(warnContent);
    listContainer.appendChild(mainInsight);

    // 2. Secondary comparative insight
    const secondaryInsight = document.createElement('div');
    const netTargetDiff = net - 2.0; // target 2.0 tonnes

    if (netTargetDiff <= 0) {
      secondaryInsight.className = 'insight-card success';
      const greenIcon = document.createElement('div');
      greenIcon.className = 'insight-icon success';
      const successI = document.createElement('i');
      successI.setAttribute('data-lucide', 'check-circle');
      successI.style.width = '20px';
      successI.style.height = '20px';
      greenIcon.appendChild(successI);
      secondaryInsight.appendChild(greenIcon);

      const successContent = document.createElement('div');
      successContent.className = 'insight-content';
      
      const successTitle = document.createElement('h4');
      successTitle.textContent = 'Climate Target Achieved!';
      successContent.appendChild(successTitle);

      const successText = document.createElement('p');
      successText.textContent = `Your net carbon index is under the Paris Accord threshold of 2.0 tonnes. Maintain your practices and pledges to lead by example.`;
      successContent.appendChild(successText);
      secondaryInsight.appendChild(successContent);
    } else {
      secondaryInsight.className = 'insight-card info';
      const infoIcon = document.createElement('div');
      infoIcon.className = 'insight-icon info';
      const infoI = document.createElement('i');
      infoI.setAttribute('data-lucide', 'info');
      infoI.style.width = '20px';
      infoI.style.height = '20px';
      infoIcon.appendChild(infoI);
      secondaryInsight.appendChild(infoIcon);

      const infoContent = document.createElement('div');
      infoContent.className = 'insight-content';

      const infoTitle = document.createElement('h4');
      infoTitle.textContent = 'Decarbonization Targets';
      infoContent.appendChild(infoTitle);

      const infoText = document.createElement('p');
      infoText.textContent = `To reach the climate target, you must reduce your net footprint by another ${netTargetDiff.toFixed(1)} tonnes annually. Activate pledges or lock offsets to bridge the gap.`;
      infoContent.appendChild(infoText);
      secondaryInsight.appendChild(infoContent);
    }

    listContainer.appendChild(secondaryInsight);

    // Initialize lucide icons inside generated insights
    if (window.lucide) window.lucide.createIcons();
  },

  renderCharts: function(breakdown) {
    if (!window.Chart) return;

    // 1. Donut Chart - Category Breakdown
    const pieCtx = document.getElementById('categoryChart');
    if (pieCtx) {
      if (this.charts.pie) this.charts.pie.destroy();

      this.charts.pie = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
          labels: ['Transport', 'Home Energy', 'Diet & Waste'],
          datasets: [{
            data: [breakdown.transport, breakdown.energy, breakdown.dietLifestyle],
            backgroundColor: [
              '#3B82F6', // Blue for transport
              '#F59E0B', // Amber for energy
              '#10B981'  // Emerald for diet
            ],
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#9CA3AF', font: { family: 'Outfit', size: 11 } }
            }
          }
        }
      });
    }

    // 2. Line Chart - Reduction Timeline History
    const lineCtx = document.getElementById('historyChart');
    if (lineCtx) {
      if (this.charts.line) this.charts.line.destroy();

      // Formulate timeline logs
      let labels = [];
      let data = [];

      if (AppState.data.history.length === 0) {
        // Populate static visual demo trend line if no audits recorded
        labels = ['Initial Audit', 'Pledge Phase 1', 'Offset Lock'];
        data = [breakdown.total, breakdown.total * 0.9, Math.max(0, breakdown.total - AppState.data.lockedOffsets)];
      } else {
        // Display user audits
        AppState.data.history.forEach((h, index) => {
          labels.push(h.date || `Audit #${index + 1}`);
          data.push(h.total);
        });
      }

      this.charts.line = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'CO₂e Footprint (tonnes)',
            data: data,
            borderColor: '#34D399',
            backgroundColor: 'rgba(52, 211, 153, 0.05)',
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointBackgroundColor: '#10B981'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              grid: { color: 'rgba(255,255,255,0.03)' },
              ticks: { color: '#9CA3AF', font: { family: 'Outfit' } }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#9CA3AF', font: { family: 'Outfit' } }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }
  },

  triggerConfetti: function() {
    if (window.confetti) {
      window.confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.75 },
        colors: ['#10B981', '#34D399', '#059669', '#3B82F6']
      });
    }
  },

  triggerLevelUpCelebration: function(newLevelName) {
    this.triggerConfetti();
    
    const levelModal = document.getElementById('levelup-modal');
    const nameDisplay = document.getElementById('new-level-name-display');
    
    if (nameDisplay) nameDisplay.textContent = `Level ${AppState.data.level} ${newLevelName}`;
    if (levelModal) levelModal.classList.add('active');

    // Focus level modal for screen readers
    levelModal.setAttribute('tabindex', '-1');
    levelModal.focus();
  },

  closeLevelUpModal: function() {
    const levelModal = document.getElementById('levelup-modal');
    if (levelModal) levelModal.classList.remove('active');
  }
};

// ==========================================
// 5. Onboarding Calculator Wizard
// ==========================================
const CalculatorWizard = {
  currentStep: 1,
  totalSteps: 4,

  openModal: function() {
    const modal = document.getElementById('calculator-modal');
    if (modal) {
      modal.classList.add('active');
      modal.focus();
    }
    
    this.currentStep = 1;
    this.updateWizardStepUI();
    this.registerSliderListeners();
    this.calculateLiveValues();
  },

  closeModal: function() {
    const modal = document.getElementById('calculator-modal');
    if (modal) modal.classList.remove('active');
  },

  registerSliderListeners: function() {
    // Distance
    const distSlider = document.getElementById('input-distance');
    if (distSlider) {
      distSlider.oninput = (e) => {
        document.getElementById('badge-distance').textContent = `${e.target.value} miles`;
        this.calculateLiveValues();
      };
    }
    
    // Transit
    const transitSlider = document.getElementById('input-transit');
    if (transitSlider) {
      transitSlider.oninput = (e) => {
        document.getElementById('badge-transit').textContent = `${e.target.value} hours`;
        this.calculateLiveValues();
      };
    }

    // Flights
    const flightSlider = document.getElementById('input-flights');
    if (flightSlider) {
      flightSlider.oninput = (e) => {
        document.getElementById('badge-flights').textContent = `${e.target.value} flights`;
        this.calculateLiveValues();
      };
    }

    // Electricity
    const elecSlider = document.getElementById('input-electricity');
    if (elecSlider) {
      elecSlider.oninput = (e) => {
        document.getElementById('badge-electricity').textContent = `$${e.target.value}`;
        this.calculateLiveValues();
      };
    }

    // Gas
    const gasSlider = document.getElementById('input-gas');
    if (gasSlider) {
      gasSlider.oninput = (e) => {
        document.getElementById('badge-gas').textContent = `$${e.target.value}`;
        this.calculateLiveValues();
      };
    }

    // Green power
    const greenSlider = document.getElementById('input-green');
    if (greenSlider) {
      greenSlider.oninput = (e) => {
        document.getElementById('badge-green').textContent = `${e.target.value}%`;
        this.calculateLiveValues();
      };
    }

    // Shopping
    const shopSlider = document.getElementById('input-shopping');
    if (shopSlider) {
      const shopLabels = { 1: 'Minimal Sourcing', 2: 'Average Sourcing', 3: 'Frequent Sourcing', 4: 'Heavy Consumption' };
      shopSlider.oninput = (e) => {
        document.getElementById('badge-shopping').textContent = shopLabels[e.target.value];
        this.calculateLiveValues();
      };
    }

    // Food Waste
    const wasteSlider = document.getElementById('input-foodwaste');
    if (wasteSlider) {
      const wasteLabels = { 1: 'Near Zero / Compost', 2: 'Average Waste', 3: 'High Food Disposal' };
      wasteSlider.oninput = (e) => {
        document.getElementById('badge-foodwaste').textContent = wasteLabels[e.target.value];
        this.calculateLiveValues();
      };
    }
  },

  updateVehicleLabel: function(label) {
    document.getElementById('badge-vehicle-type').textContent = label;
    // Visually toggle classes inside card grid
    const cards = document.querySelectorAll('#step-panel-1 .form-select-card');
    cards.forEach(c => c.classList.remove('selected'));
    
    const mapping = {
      'Petrol': 'lbl-vehicle-petrol',
      'Diesel': 'lbl-vehicle-diesel',
      'Electric (EV)': 'lbl-vehicle-electric',
      'No Car / Bike': 'lbl-vehicle-none'
    };
    const el = document.getElementById(mapping[label]);
    if (el) el.classList.add('selected');
    
    // Toggle distance inputs if user has no car
    const distGrp = document.getElementById('group-distance');
    if (distGrp) {
      if (label === 'No Car / Bike') {
        distGrp.style.display = 'none';
      } else {
        distGrp.style.display = 'flex';
      }
    }
    
    this.calculateLiveValues();
  },

  updateDietLabel: function(label) {
    document.getElementById('badge-diet-type').textContent = label;
    const cards = document.querySelectorAll('#step-panel-3 .form-select-card');
    cards.forEach(c => c.classList.remove('selected'));

    const mapping = {
      'Average/Mixed': 'lbl-diet-mixed',
      'Low-Meat / Veggie': 'lbl-diet-meatless',
      'Vegetarian': 'lbl-diet-veg',
      'Strict Vegan': 'lbl-diet-vegan'
    };
    const el = document.getElementById(mapping[label]);
    if (el) el.classList.add('selected');
    
    this.calculateLiveValues();
  },

  updateSortingLabel: function(label) {
    document.getElementById('badge-sorting-level').textContent = label;
    const cards = document.querySelectorAll('#step-panel-4 .form-select-card');
    cards.forEach(c => c.classList.remove('selected'));

    const mapping = {
      'No Recycling': 'lbl-sorting-none',
      'Partial Sorting': 'lbl-sorting-partial',
      'Thorough Sorting': 'lbl-sorting-strict'
    };
    const el = document.getElementById(mapping[label]);
    if (el) el.classList.add('selected');

    this.calculateLiveValues();
  },

  gatherInputs: function() {
    // Extract values
    const vehicleEl = document.querySelector('input[name="vehicleType"]:checked');
    const dietEl = document.querySelector('input[name="dietType"]:checked');
    const sortEl = document.querySelector('input[name="sortingLevel"]:checked');

    return {
      vehicleType: vehicleEl ? vehicleEl.value : 'petrol',
      distance: document.getElementById('input-distance').value,
      transit: document.getElementById('input-transit').value,
      flights: document.getElementById('input-flights').value,
      electricity: document.getElementById('input-electricity').value,
      gas: document.getElementById('input-gas').value,
      greenPercent: document.getElementById('input-green').value,
      dietType: dietEl ? dietEl.value : 'mixed',
      shopping: document.getElementById('input-shopping').value,
      foodwaste: document.getElementById('input-foodwaste').value,
      sortingLevel: sortEl ? sortEl.value : 'partial'
    };
  },

  calculateLiveValues: function() {
    const inputs = this.gatherInputs();
    const result = CarbonCalculator.calculate(inputs);
    document.getElementById('calc-live-val').textContent = result.total.toFixed(1);
  },

  changeStep: function(direction) {
    const next = this.currentStep + direction;
    
    if (next > this.totalSteps) {
      this.finishAudit();
      return;
    }

    if (next >= 1 && next <= this.totalSteps) {
      this.currentStep = next;
      this.updateWizardStepUI();
    }
  },

  updateWizardStepUI: function() {
    // Nodes active
    for (let i = 1; i <= this.totalSteps; i++) {
      const node = document.getElementById(`step-node-1`); // visual check
      const currentEl = document.getElementById(`step-node-${i}`);
      const panelEl = document.getElementById(`step-panel-${i}`);
      
      if (currentEl) {
        if (i < this.currentStep) {
          currentEl.className = 'calc-step-node completed';
          currentEl.setAttribute('aria-current', 'false');
        } else if (i === this.currentStep) {
          currentEl.className = 'calc-step-node active';
          currentEl.setAttribute('aria-current', 'step');
        } else {
          currentEl.className = 'calc-step-node';
          currentEl.setAttribute('aria-current', 'false');
        }
      }

      if (panelEl) {
        if (i === this.currentStep) {
          panelEl.classList.add('active');
        } else {
          panelEl.classList.remove('active');
        }
      }
    }

    // Step bar progress line
    const progressWidth = ((this.currentStep - 1) / (this.totalSteps - 1)) * 100;
    document.getElementById('step-bar-fill').style.width = `${progressWidth}%`;

    // Buttons control
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');

    if (this.currentStep === 1) {
      prevBtn.setAttribute('disabled', 'true');
    } else {
      prevBtn.removeAttribute('disabled');
    }

    if (this.currentStep === this.totalSteps) {
      nextBtn.textContent = 'Submit';
    } else {
      nextBtn.textContent = 'Next';
    }
  },

  finishAudit: function() {
    const inputs = this.gatherInputs();
    const result = CarbonCalculator.calculate(inputs);
    
    // Save state
    AppState.data.inputs = inputs;
    AppState.data.breakdown = result;
    AppState.data.hasCalculated = true;
    
    // Add to history
    const dateStr = new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    AppState.data.history.push({
      date: dateStr,
      total: result.total
    });

    // Award initial XP
    const isLevelUp = AppState.data.xp === 0 ? AppState.addXP(100) : AppState.addXP(25);
    AppState.save();

    // Close and load dashboard
    this.closeModal();
    
    // Hide initial welcome screen if visible
    const welcomeSection = document.getElementById('panel-welcome');
    if (welcomeSection) welcomeSection.classList.remove('active');

    App.updateUserProgressUI();
    App.switchPanel('dashboard');

    if (isLevelUp) {
      App.triggerLevelUpCelebration(AppState.data.levelName);
    } else {
      App.triggerConfetti();
    }
    
    // Re-render achievements
    PledgeManager.renderBadges();
  },

  loadMockAverage: function() {
    // Direct Mock for ease of verification/mock
    const mockBreakdown = {
      transport: 5.6,
      energy: 4.8,
      dietLifestyle: 3.4,
      total: 13.8
    };

    AppState.data.inputs = {
      vehicleType: 'petrol',
      distance: 220,
      transit: 2,
      flights: 1,
      electricity: 120,
      gas: 60,
      greenPercent: 10,
      dietType: 'mixed',
      shopping: 2,
      foodwaste: 2,
      sortingLevel: 'partial'
    };
    AppState.data.breakdown = mockBreakdown;
    AppState.data.hasCalculated = true;
    
    const dateStr = new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
    AppState.data.history = [{ date: dateStr, total: 13.8 }];
    
    AppState.addXP(100);
    AppState.save();

    const welcomeSection = document.getElementById('panel-welcome');
    if (welcomeSection) welcomeSection.classList.remove('active');

    App.updateUserProgressUI();
    App.switchPanel('dashboard');
    App.triggerConfetti();
    PledgeManager.renderBadges();
  }
};

// ==========================================
// 6. Action Hub Pledge Manager
// ==========================================
const PledgeManager = {
  currentCategoryFilter: 'all',

  filterCategory: function(cat) {
    this.currentCategoryFilter = cat;
    
    // Toggle active tab buttons
    const btns = document.querySelectorAll('.pledges-category-tabs .tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    
    const activeBtn = document.getElementById(`tab-${cat}`);
    if (activeBtn) activeBtn.classList.add('active');
    
    this.renderPledges();
  },

  renderPledges: function() {
    const list = document.getElementById('pledges-list-container');
    if (!list) return;

    // Securely clear list
    list.textContent = '';

    const filtered = PledgeLibrary.filter(p => {
      if (this.currentCategoryFilter === 'all') return true;
      return p.category === this.currentCategoryFilter;
    });

    filtered.forEach(p => {
      const isCommitted = AppState.data.pledges.includes(p.id);
      const isDoneToday = AppState.data.completedToday.includes(p.id);

      // Card element XSS-safe construction
      const card = document.createElement('div');
      card.className = `pledge-item-card ${isCommitted ? 'pledged' : ''}`;
      card.setAttribute('role', 'listitem');

      const infoDiv = document.createElement('div');
      infoDiv.className = 'pledge-item-info';

      // Checkbox container
      const chkContainer = document.createElement('div');
      chkContainer.className = 'pledge-checkbox-container';

      const chkInput = document.createElement('input');
      chkInput.type = 'checkbox';
      chkInput.ariaLabel = `Complete pledge ${p.title}`;
      chkInput.checked = isDoneToday;
      chkInput.disabled = !isCommitted; // must join pledge first
      chkInput.onchange = (e) => this.togglePledgeCompletion(p.id, e.target.checked);

      const checkmarkSpan = document.createElement('span');
      checkmarkSpan.className = 'checkmark';
      const checkI = document.createElement('i');
      checkI.setAttribute('data-lucide', 'check');
      checkI.style.width = '14px';
      checkI.style.height = '14px';
      checkmarkSpan.appendChild(checkI);

      chkContainer.appendChild(chkInput);
      chkContainer.appendChild(checkmarkSpan);
      infoDiv.appendChild(chkContainer);

      // Text detail
      const details = document.createElement('div');
      details.className = 'pledge-details';

      const title = document.createElement('span');
      title.className = 'pledge-title';
      title.textContent = p.title;

      const meta = document.createElement('div');
      meta.className = 'pledge-meta';

      const co2Span = document.createElement('span');
      co2Span.className = 'pledge-co2-save';
      co2Span.textContent = `-${p.co2} kg CO₂/day`;

      const xpSpan = document.createElement('span');
      xpSpan.className = 'pledge-xp-gain';
      xpSpan.textContent = `+${p.xp} XP`;

      const desc = document.createElement('p');
      desc.style.fontSize = '0.75rem';
      desc.style.color = 'var(--text-muted)';
      desc.style.marginTop = '4px';
      desc.textContent = p.desc;

      meta.appendChild(co2Span);
      meta.appendChild(xpSpan);
      details.appendChild(title);
      details.appendChild(meta);
      details.appendChild(desc);
      infoDiv.appendChild(details);

      card.appendChild(infoDiv);

      // Join/Quit Button
      const actBtn = document.createElement('button');
      actBtn.type = 'button';
      actBtn.className = 'pledge-btn';
      actBtn.textContent = isCommitted ? 'Release' : 'Pledge';
      actBtn.onclick = () => this.togglePledgeCommitment(p.id);
      
      card.appendChild(actBtn);
      list.appendChild(card);
    });

    // Refresh icons
    if (window.lucide) window.lucide.createIcons();
  },

  togglePledgeCommitment: function(pid) {
    const list = AppState.data.pledges;
    const index = list.indexOf(pid);

    if (index === -1) {
      list.push(pid);
      AppState.addXP(10); // small XP award for taking on a commitment
    } else {
      list.splice(index, 1);
      // Remove from completed if released
      const compIndex = AppState.data.completedToday.indexOf(pid);
      if (compIndex !== -1) AppState.data.completedToday.splice(compIndex, 1);
    }
    
    AppState.save();
    App.updateUserProgressUI();
    this.renderPledges();
    this.renderBadges();
  },

  togglePledgeCompletion: function(pid, isChecked) {
    const comp = AppState.data.completedToday;
    const pledgeItem = PledgeLibrary.find(x => x.id === pid);
    if (!pledgeItem) return;

    const index = comp.indexOf(pid);

    if (isChecked && index === -1) {
      comp.push(pid);
      App.incrementStreak();
      const levelUp = AppState.addXP(pledgeItem.xp);
      
      if (levelUp) {
        App.triggerLevelUpCelebration(AppState.data.levelName);
      } else {
        App.triggerConfetti();
      }
    } else if (!isChecked && index !== -1) {
      comp.splice(index, 1);
      AppState.data.xp = Math.max(0, AppState.data.xp - pledgeItem.xp);
      AppState.save();
    }

    AppState.save();
    App.updateUserProgressUI();
    this.renderBadges();
  },

  renderBadges: function() {
    const container = document.getElementById('badges-container');
    if (!container) return;

    // Securely clear container
    container.textContent = '';

    BadgesLibrary.forEach(b => {
      const isUnlocked = b.requirement(AppState.data);

      const card = document.createElement('article');
      card.className = `badge-item-card ${isUnlocked ? 'unlocked' : ''}`;

      const iconDiv = document.createElement('div');
      iconDiv.className = 'badge-icon';
      const badgeI = document.createElement('i');
      badgeI.setAttribute('data-lucide', 'shield');
      iconDiv.appendChild(badgeI);

      const name = document.createElement('span');
      name.className = 'badge-name';
      name.textContent = b.title;

      const desc = document.createElement('p');
      desc.className = 'badge-desc';
      desc.textContent = b.desc;

      card.appendChild(iconDiv);
      card.appendChild(name);
      card.appendChild(desc);
      container.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
  }
};

// ==========================================
// 7. Carbon Footprint Search Engine
// ==========================================
const SearchEngine = {
  init: function() {
    const input = document.getElementById('footprint-search-input');
    if (input) {
      input.addEventListener('input', (e) => this.handleSearch(e.target.value));
    }
  },

  handleSearch: function(query) {
    const container = document.getElementById('search-results-container');
    if (!container) return;

    const cleanQuery = query.toLowerCase().trim();

    if (cleanQuery.length === 0) {
      container.textContent = '';
      const placeholder = document.createElement('p');
      placeholder.style.textAlign = 'center';
      placeholder.style.color = 'var(--text-muted)';
      placeholder.style.fontSize = '0.85rem';
      placeholder.style.padding = '24px 0';
      placeholder.textContent = 'Try searching for "beef", "bagel", "avocado", "t-shirt", "laptop", or "plastic bag".';
      container.appendChild(placeholder);
      return;
    }

    // Securely clear container
    container.textContent = '';

    // Search keys
    const keys = Object.keys(FoodprintIndex);
    const matches = keys.filter(k => k.includes(cleanQuery));

    if (matches.length === 0) {
      const noResult = document.createElement('p');
      noResult.style.textAlign = 'center';
      noResult.style.color = 'var(--text-muted)';
      noResult.style.fontSize = '0.85rem';
      noResult.style.padding = '24px 0';
      noResult.textContent = 'No matching items found. Try different keywords.';
      container.appendChild(noResult);
      return;
    }

    // Build lists XSS-safe
    matches.forEach(m => {
      const item = FoodprintIndex[m];
      
      const card = document.createElement('div');
      card.className = 'search-item-card';

      const detailsDiv = document.createElement('div');
      detailsDiv.style.display = 'flex';
      detailsDiv.style.flexDirection = 'column';
      detailsDiv.style.gap = '4px';

      const name = document.createElement('span');
      name.className = 'search-item-name';
      name.style.textTransform = 'capitalize';
      name.textContent = m;

      const desc = document.createElement('p');
      desc.style.fontSize = '0.75rem';
      desc.style.color = 'var(--text-muted)';
      desc.textContent = item.desc;

      detailsDiv.appendChild(name);
      detailsDiv.appendChild(desc);

      const val = document.createElement('span');
      val.className = 'search-item-val';
      val.textContent = `${item.val} kg`;

      card.appendChild(detailsDiv);
      card.appendChild(val);
      container.appendChild(card);
    });
  }
};

// ==========================================
// 8. Offset Simulator Engine
// ==========================================
const OffsetSimulator = {
  init: function() {
    const slTrees = document.getElementById('slider-trees');
    const slSolar = document.getElementById('slider-solar');
    const slCredits = document.getElementById('slider-credits');

    if (slTrees) slTrees.oninput = (e) => this.handleUpdate();
    if (slSolar) slSolar.oninput = (e) => this.handleUpdate();
    if (slCredits) slCredits.oninput = (e) => this.handleUpdate();

    this.handleUpdate();
  },

  handleUpdate: function() {
    const trees = Number(document.getElementById('slider-trees').value) || 0;
    const solar = Number(document.getElementById('slider-solar').value) || 0;
    const credits = Number(document.getElementById('slider-credits').value) || 0;

    // Badges update
    document.getElementById('badge-trees').textContent = `${trees} trees`;
    document.getElementById('badge-solar').textContent = `${solar.toLocaleString()} kWh`;
    document.getElementById('badge-credits').textContent = `$${credits} USD`;

    // Calculation CO2 mitigation in tonnes:
    // Tree = 22kg CO2/year -> 0.022 tonnes
    const treeAbsorb = (trees * 22) / 1000;
    // Solar displacing grid = 0.45kg CO2/kWh -> 0.00045 tonnes
    const solarDisplace = (solar * 0.45) / 1000;
    // Direct Credits = $200 per tonne -> 1 tonne per $200
    const directCredits = credits / 200;

    const totalSimulated = treeAbsorb + solarDisplace + directCredits;
    const totalEmissions = AppState.data.breakdown.total;

    let percent = 0;
    if (totalEmissions > 0) {
      percent = Math.min(100, Math.floor((totalSimulated / totalEmissions) * 100));
    }
    const remaining = Math.max(0, totalEmissions - totalSimulated);

    // Save simulation temporary values to AppState
    AppState.data.simulatedOffsets = { trees, solar, credits };

    // Update screen components
    document.getElementById('offset-amount-display').textContent = totalSimulated.toFixed(3);
    document.getElementById('offset-percent-display').textContent = `${percent}%`;
    document.getElementById('offset-remaining-display').textContent = remaining.toFixed(1);
  },

  applySimulatedOffsets: function() {
    // Mitigate remaining footprint by locking simulated offsets
    const trees = AppState.data.simulatedOffsets.trees;
    const solar = AppState.data.simulatedOffsets.solar;
    const credits = AppState.data.simulatedOffsets.credits;

    const totalOffsetTonnes = ((trees * 22) + (solar * 0.45)) / 1000 + (credits / 200);

    if (totalOffsetTonnes <= 0) return;

    AppState.data.lockedOffsets += parseFloat(totalOffsetTonnes.toFixed(3));
    
    // Reward XP
    const pointsAwarded = Math.min(100, Math.floor(totalOffsetTonnes * 10)); // max 100 XP
    const levelUp = AppState.addXP(pointsAwarded);

    // Reset sliders
    document.getElementById('slider-trees').value = 0;
    document.getElementById('slider-solar').value = 0;
    document.getElementById('slider-credits').value = 0;

    AppState.save();
    this.handleUpdate();
    App.updateUserProgressUI();
    
    if (levelUp) {
      App.triggerLevelUpCelebration(AppState.data.levelName);
    } else {
      App.triggerConfetti();
    }
    
    // Re-render badges
    PledgeManager.renderBadges();
  }
};

// ==========================================
// 9. Educational Feed Content Builder
// ==========================================
const EducationalFeed = {
  init: function() {
    const container = document.getElementById('educational-feed-container');
    if (!container) return;

    // Securely clear
    container.textContent = '';

    EducationalArticles.forEach((a, idx) => {
      const article = document.createElement('article');
      article.className = 'edu-item-accordion';
      article.id = `edu-accordion-${idx}`;

      const header = document.createElement('div');
      header.className = 'edu-item-header';
      header.setAttribute('role', 'button');
      header.setAttribute('aria-expanded', 'false');
      header.setAttribute('tabindex', '0');
      header.onclick = () => this.toggleAccordion(article, header);
      header.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggleAccordion(article, header);
        }
      };

      const title = document.createElement('h4');
      title.textContent = a.title;

      const icon = document.createElement('i');
      icon.className = 'edu-item-header-icon';
      icon.setAttribute('data-lucide', 'chevron-down');
      icon.setAttribute('aria-hidden', 'true');

      header.appendChild(title);
      header.appendChild(icon);

      const body = document.createElement('div');
      body.className = 'edu-item-body';

      const content = document.createElement('div');
      content.className = 'edu-item-body-content';
      a.blocks.forEach(b => {
        const el = document.createElement(b.type);
        el.textContent = b.text;
        if (b.type === 'li') {
          el.style.marginLeft = '20px';
          el.style.display = 'list-item';
        }
        content.appendChild(el);
      });

      body.appendChild(content);
      article.appendChild(header);
      article.appendChild(body);
      container.appendChild(article);
    });

    if (window.lucide) window.lucide.createIcons();
  },

  toggleAccordion: function(articleEl, headerEl) {
    const isOpen = articleEl.classList.contains('open');
    
    // Close other accordions
    const all = document.querySelectorAll('.edu-item-accordion');
    all.forEach(x => {
      x.classList.remove('open');
      const hdr = x.querySelector('.edu-item-header');
      if (hdr) hdr.setAttribute('aria-expanded', 'false');
    });

    if (!isOpen) {
      articleEl.classList.add('open');
      headerEl.setAttribute('aria-expanded', 'true');
    }
  }
};

// Start application on DOM Content Loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
}

// Export for Node.js testing environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CarbonCalculator, AppState, PledgeLibrary, FoodprintIndex };
}
