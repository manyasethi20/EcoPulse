/**
 * EcoPulse Main Bootstrap Script
 */

import { App, CalculatorWizard, PledgeManager, SearchEngine, OffsetSimulator, EducationalFeed } from './ui.js';
import { AppState } from './state.js';
import { CarbonCalculator } from './calculator.js';

// Attach modules to window to support existing inline HTML handlers
window.App = App;
window.CalculatorWizard = CalculatorWizard;
window.PledgeManager = PledgeManager;
window.SearchEngine = SearchEngine;
window.OffsetSimulator = OffsetSimulator;
window.EducationalFeed = EducationalFeed;
window.AppState = AppState;
window.CarbonCalculator = CarbonCalculator;

// Start application on DOMContentLoaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
}
