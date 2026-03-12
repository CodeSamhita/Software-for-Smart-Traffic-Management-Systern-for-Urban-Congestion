# Smart Traffic Management System for Urban Congestion

This project is an interactive simulation of an urban traffic junction with adaptive signal control. It is designed as a capstone-style software prototype that demonstrates how live corridor pressure, queue length, wait time, vehicle-to-vehicle coordination, and emergency-priority handling can improve traffic flow.

## Current Prototype

- Adaptive and fixed-cycle signal modes
- Demand profiles for balanced flow, rush-hour bias, and event dispersal
- Live congestion dashboard with wait time, throughput, and corridor pressure
- Emergency vehicle dispatch for ambulance, police, fire and rescue, and disaster response
- Vehicle-to-vehicle communication that tells nearby traffic to yield or hold before the intersection
- Vehicle-to-infrastructure preemption that lets the controller grant faster green access to emergency corridors
- Emergency actions such as priority passage, intersection lockdown, rescue convoy, and evacuation wave
- Built-in live analytics logging with automatic 1-second timeline samples, event logs, and JSON/CSV export
- Standalone `traffic-analytics.html` page for live traffic graphs over time, plus offline JSON import for historical review
- Canvas-based intersection simulation with vehicle movement and signal visualization

## Project Structure

- `Simulation/simulation1.html`: self-contained traffic simulation and dashboard
- `Simulation/traffic-analytics.html`: standalone live graph dashboard for timeline analytics

## How to Run

Open `Simulation/simulation1.html` in a modern browser.

To view graphs over time, open `Simulation/traffic-analytics.html` in the same browser while the simulation is running. The graph page reads the live analytics feed every second and can also import exported JSON logs.

## Capstone Scope

The current version focuses on a single intelligent junction. It can be extended into a larger smart traffic platform by adding:

- multi-junction coordination
- camera or sensor data ingestion
- route optimization for emergency vehicles
- historical congestion analytics
- web or mobile operator dashboards
