/**
 * EcoPulse Carbon Calculator Engine
 */

export const CarbonCalculator = {
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
