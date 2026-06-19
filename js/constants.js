/**
 * EcoPulse Constants and Static Datasets
 */

export const PledgeLibrary = [
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

export const BadgesLibrary = [
  { id: 'b_calc', title: 'Self-Aware', desc: 'Conduct your first carbon footprint audit.', requirement: (s) => s.hasCalculated },
  { id: 'b_level2', title: 'Eco-Pilot', desc: 'Reach level 2 by taking action.', requirement: (s) => s.level >= 2 },
  { id: 'b_level5', title: 'Sustainability Sage', desc: 'Reach level 5.', requirement: (s) => s.level >= 5 },
  { id: 'b_pledge3', title: 'Eco-Warrior', desc: 'Commit to 3 active pledges.', requirement: (s) => s.pledges.length >= 3 },
  { id: 'b_offset', title: 'Carbon Neutralizer', desc: 'Mitigate emissions via offsetting.', requirement: (s) => s.lockedOffsets > 0 },
  { id: 'b_streak5', title: 'Consistent Guardian', desc: 'Achieve a 5-day action streak.', requirement: (s) => s.streak >= 5 }
];

export const FoodprintIndex = {
  'beef': { val: 27.0, desc: 'kg CO₂e per kg. Extremely carbon-heavy due to methane emissions and land clearances.' },
  'lamb': { val: 23.0, desc: 'kg CO₂e per kg. Ruminant livestock release high rates of methane gas.' },
  'cheese': { val: 12.0, desc: 'kg CO₂e per kg. Dairy processing and milk supply chains require massive energy.' },
  'pork': { val: 7.2, desc: 'kg CO₂e per kg. Moderate emissions, lower than beef but higher than poultry.' },
  'chicken': { val: 5.0, desc: 'kg CO₂e per kg. Standard poultry has moderate grain farming carbon costs.' },
  'fish': { val: 6.0, desc: 'kg CO₂e per kg (farmed). Transportation and refrigeration form core emissions.' },
  'eggs': { val: 4.8, desc: 'kg CO₂e per kg. High density poultry feeding systems generate moderate footprints.' },
  'rice': { val: 2.7, desc: 'kg CO₂e per kg. Flooded rice paddies support methane-producing bacteria.' },
  'tofu': { val: 2.0, desc: 'kg CO₂e per kg. Plant protein from soybeans has very low emissions.' },
  'milk': { val: 1.9, desc: 'kg CO₂e per liter (dairy). Pasturing emissions and factory processing cost.' },
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

export const EducationalArticles = [
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
