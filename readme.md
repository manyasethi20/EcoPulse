# 🌱 EcoPulse – Carbon Footprint Awareness Platform

## Overview

EcoPulse is a web application that helps users understand, track, and reduce their carbon footprint through a personalized assessment, interactive dashboard, sustainability challenges, and educational resources.

The platform calculates emissions from transportation, home energy usage, diet, and lifestyle habits, then provides insights and recommendations to encourage environmentally friendly decisions.

---

## Features

### 🚗 Carbon Footprint Calculator

* Multi-step assessment process
* Transport emissions calculation
* Home energy emissions calculation
* Diet and food impact analysis
* Lifestyle and consumption tracking
* Real-time carbon footprint updates

### 📊 Interactive Dashboard

* Total annual carbon footprint
* Category-wise emissions breakdown
* Visual charts and analytics
* Comparison with sustainability targets
* Personalized recommendations

### 🎯 Action Hub

* Eco-friendly challenges and pledges
* XP and level system
* Achievement badges
* Daily streak tracking
* Progress monitoring

### 📚 Learn Section

* Carbon footprint search tool
* Educational sustainability tips
* Environmental awareness resources

### 🌳 Carbon Offset Calculator

* Tree planting estimates
* Carbon credit calculations
* Renewable energy offset suggestions

---

## Technologies Used

* HTML5
* CSS3
* JavaScript (Vanilla JS)
* Chart.js
* Lucide Icons
* Local Storage API

---

## Project Structure

```text
carbon-footprint-tracker/
│
├── index.html
├── index.css
├── app.js
└── README.md
```

---

## How to Run the Project

### Method 1: Open Directly

1. Download all project files.
2. Keep all files in the same folder.
3. Open `index.html` in your browser.

### Method 2: Run Local Server (Recommended)

Open PowerShell inside the project folder:

```bash
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

---

## Testing

### Carbon Calculator Test

Open the browser console and run:

```javascript
CarbonCalculator.calculate({
  vehicleType: "none",
  annualKm: 0,
  flightsShort: 0,
  flightsLong: 0,
  publicTransit: 0,
  electricityKwh: 0,
  heatingType: "none",
  heatingUsage: 0,
  greenEnergyPct: 100,
  householdSize: 1,
  dietType: "vegan",
  foodWaste: "very_low",
  localFoodPct: 100,
  shoppingFreq: "minimal",
  electronicsFreq: "none",
  streamingHrs: 0,
  recyclingLevel: "excellent"
});
```

Expected result: Very low carbon footprint.

---

## Security Features

* Input validation for all user entries
* Safe DOM manipulation
* Protection against invalid local storage data
* No direct execution of user-generated content

---

## Accessibility Features

* Semantic HTML structure
* ARIA labels for screen readers
* Keyboard-friendly navigation
* High-contrast color scheme
* Responsive design for mobile and desktop devices

---

## Future Improvements

* User authentication
* Cloud database integration
* Community challenges
* Leaderboards
* Carbon footprint sharing
* AI-powered sustainability recommendations

---

## Author

Developed as part of a Carbon Footprint Awareness Platform project using modern web technologies and interactive design principles.
