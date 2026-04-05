# Smart Traffic Management System for Urban Congestion

This draft follows the structure from `template Instructions - Internship or Project Report.docx`.
Replace every `[TO BE FILLED MANUALLY]` item before submission.

## Title Page

Project Title: Smart Traffic Management System for Urban Congestion

Submitted by:
[TO BE FILLED MANUALLY: student names and IDs]

Under the guidance of:
[TO BE FILLED MANUALLY: guide name]

[TO BE FILLED MANUALLY: degree, department, university, month, year]

## Bonafide Certificate

[TO BE FILLED MANUALLY as per department template]

## Declaration

[TO BE FILLED MANUALLY as per department template]

## Acknowledgement

We express our sincere gratitude to our project guide, faculty members, and the Department of Computer Science and Engineering for their valuable support throughout this work. We also thank Presidency University for providing the facilities and environment needed to complete the project. We are grateful to our peers and well-wishers for their suggestions during development, testing, and documentation. Finally, we acknowledge the contribution of open-source communities whose tools and libraries supported the implementation of this system.

## Abstract

Urban traffic congestion is a major challenge in modern cities due to rising vehicle density, mixed traffic conditions, and limited real-time traffic control. Conventional fixed-time traffic systems often fail to respond effectively to changing road conditions, resulting in delay, fuel wastage, and reduced mobility. This project proposes a Smart Traffic Management System for Urban Congestion that combines computer vision, live analytics, and AI-assisted recommendations to support adaptive traffic monitoring and control.

The system accepts input from a live camera, traffic video, or image. It uses a YOLO-based detection pipeline with an OpenCV fallback method to identify cars, motorcycles, buses, trucks, bicycles, pedestrians, and other road users. A tracking and analytics layer computes corridor-wise pressure, congestion index, mobility score, and throughput across four directions of an intersection. Based on these live metrics, the system generates recommendations using OpenAI, Ollama, or offline rule-based logic depending on availability.

The developed prototype provides a web dashboard for annotated video, alerts, traffic metrics, and operator suggestions. The system is modular and resilient, and it continues operating even when the primary detector or cloud advisory path is unavailable. The project demonstrates that camera-based traffic intelligence can support smarter urban congestion management and serve as a foundation for future intelligent transportation systems.

## Abbreviations

AI - Artificial Intelligence
API - Application Programming Interface
CV - Computer Vision
FPS - Frames Per Second
IoT - Internet of Things
LLM - Large Language Model
SDG - Sustainable Development Goal
YOLO - You Only Look Once

# Chapter 1 Introduction

## 1.1 Background

Traffic congestion affects travel time, fuel efficiency, road safety, and urban productivity. In mixed-traffic environments, manual and fixed-time traffic management approaches are often inadequate because they do not adapt to real-time demand. Computer vision and intelligent analytics can improve traffic observation and support better operational decisions.

## 1.2 Statistics of Project

[TO BE FILLED MANUALLY with cited Bengaluru/India congestion statistics]

## 1.3 Prior Existing Technologies

Earlier approaches include fixed-time traffic signals, sensor-based adaptive systems, simulation-only models, and basic camera-based counting systems. Many of them either require expensive infrastructure, do not handle mixed urban traffic well, or do not provide operator-friendly recommendations.

## 1.4 Proposed Approach

The proposed system processes traffic scenes from camera, image, or video sources; detects road users; tracks movement; computes congestion metrics; and displays insights through a web dashboard. An advisory layer generates short traffic-management suggestions using online or offline intelligence.

## 1.5 Objectives

1. Detect mixed traffic participants from live or recorded scenes.
2. Estimate corridor-wise congestion in real time.
3. Compute traffic indicators such as congestion index, mobility, and throughput.
4. Provide actionable traffic suggestions.
5. Visualize annotated results through a dashboard.
6. Maintain operation using fallback mechanisms.

## 1.6 SDGs

This project supports SDG 9, SDG 11, SDG 3, and SDG 13 by contributing to smarter infrastructure, safer mobility, and reduced congestion-related emissions.

## 1.7 Overview of Project Report

The report covers introduction, literature review, methodology, project management, analysis and design, implementation, evaluation, broader impacts, and conclusion.

# Chapter 2 Literature Review

[TO BE FILLED MANUALLY with 5 to 8 recent journal/conference papers]

Suggested review themes:
1. Vision-based traffic monitoring
2. YOLO-based vehicle detection
3. Intelligent traffic control
4. Smart-city traffic analytics
5. AI-assisted transportation systems

Suggested gap:
Most existing works focus only on detection, simulation, or infrastructure-heavy sensing. Fewer systems combine mixed-traffic visual detection, directional analytics, dashboard visualization, and fallback advisory support in one modular prototype.

# Chapter 3 Methodology

The project follows a modular software-engineering methodology. The pipeline is divided into source acquisition, detection, tracking, analytics, recommendation, and dashboard layers.

The source manager accepts live camera, image, and video inputs. A YOLO detector is used as the primary perception component, while an OpenCV motion detector acts as a fallback when YOLO is unavailable. A centroid-based tracker links detections across frames. The analytics engine then divides the scene into north, east, south, and west corridors and computes vehicle count, weighted pressure, mobility, throughput, pedestrian presence, and congestion index.

An advisory orchestrator generates suggestions through OpenAI, Ollama, or offline rules. The final outputs are streamed through a Flask-based dashboard that shows annotated video, alerts, and metrics. This methodology was chosen because it supports maintainability, resilience, and future extensibility.

# Chapter 4 Project Management

## 4.1 Project Timeline

[TO BE FILLED MANUALLY with month-wise or phase-wise timeline]

Suggested phases:
1. Problem identification
2. Literature survey
3. Architecture design
4. Simulation development
5. Vision-system integration
6. Testing and tuning
7. Documentation

## 4.2 Risk Analysis

1. YOLO model load failure: mitigated through OpenCV fallback.
2. API or network failure: mitigated through local or offline advisor.
3. Poor video quality: mitigated through source selection and threshold tuning.
4. Mixed traffic complexity: mitigated using weighted analytics and label normalization.
5. Low hardware performance: mitigated through moderate FPS and lightweight models.

## 4.3 Project Budget

[TO BE FILLED MANUALLY]

You can add a simple cost table for laptop, camera, internet, electricity, and optional API usage.

# Chapter 5 Analysis and Design

## 5.1 Requirements

Functional requirements:
1. Accept camera, image, and video sources.
2. Detect and track road users.
3. Compute corridor-level traffic metrics.
4. Generate suggestions and alerts.
5. Stream output to a dashboard.

Non-functional requirements:
1. Modularity
2. Reliability
3. Maintainability
4. Real-time responsiveness
5. Configurability

## 5.2 Block Diagram

[TO BE FILLED MANUALLY]

Suggested block flow:
Traffic source -> Source manager -> Detector -> Tracker -> Analytics -> Advisory layer -> Flask dashboard

## 5.3 System Flow Chart

[TO BE FILLED MANUALLY]

Suggested flow:
Start -> Read source -> Detect -> Track -> Analyze -> Generate advice -> Display -> Repeat

## 5.4 Choosing Devices

The prototype is software-centric and does not require dedicated road hardware. A standard laptop or desktop and a webcam or traffic video source are sufficient for development and testing.

## 5.5 Designing Units

The system contains six units:
1. Input acquisition
2. Detection
3. Tracking
4. Analytics
5. Advisory
6. Dashboard

## 5.6 Standards

Relevant areas include HTTP-based communication, responsible AI practices, and software fault-tolerance principles.

## 5.7 Mapping with IoTWF Reference Model Layers

Physical device: camera/video source
Connectivity: local and optional network interfaces
Data accumulation: runtime history and snapshots
Data abstraction: corridor metrics and structured state
Application: dashboard and APIs
Business/process layer: operator action and traffic intervention

## 5.8 Domain Model Specification

Main entities:
1. Detection
2. Track
3. CorridorState
4. SuggestionPacket
5. TrafficSnapshot
6. AppConfig

## 5.9 Communication Model

The browser communicates with the Flask application through HTTP endpoints and an MJPEG video feed. The advisory layer may optionally communicate with OpenAI or Ollama.

## 5.10 IoT Deployment Level

The current prototype is a single-node intelligent monitoring system where capture, processing, analytics, and dashboard delivery happen on one machine.

## 5.11 Functional View

Input handling, vision inference, tracking, analytics, recommendation, and visualization form the main functional view.

## 5.12 Mapping IoT Deployment Level with Functional View

All major functions are co-located on one computing node, making the prototype easy to deploy and test.

## 5.13 Operational View

The system loads the selected source, processes frames continuously, updates the dashboard, and falls back to alternative detector or advisor paths when needed.

## 5.14 Other Design

Graceful degradation is an important design feature. The system does not stop entirely when one module becomes unavailable.

# Chapter 6 Hardware, Software and Simulation

## 6.1 Hardware

Minimum hardware includes:
1. Laptop or desktop
2. Webcam or integrated camera
3. Stored traffic videos or images

[TO BE FILLED MANUALLY with your processor, RAM, OS, camera details]

## 6.2 Software Development Tools

Python, Flask, OpenCV, Ultralytics YOLO, NumPy, Pillow, Requests, python-dotenv, OpenAI SDK, Ollama, PowerShell, HTML, CSS, and JavaScript were used in the project.

## 6.3 Software Code

Core modules:
1. `run_traffic_ai.py` for bootstrap and launch
2. `traffic_ai/config.py` for configuration
3. `traffic_ai/vision/detector.py` for detection
4. `traffic_ai/vision/tracker.py` for tracking
5. `traffic_ai/services/analytics.py` for metrics
6. `traffic_ai/services/advisors.py` for suggestions
7. `traffic_ai/services/processor.py` for pipeline orchestration
8. `traffic_ai/web/app.py` for dashboard and APIs

## 6.4 Simulation

The repository also contains HTML simulation files:
1. `Simulation/simulation1.html`
2. `Simulation/traffic-analytics.html`

These support conceptual traffic simulation and complement the live vision system.

# Chapter 7 Evaluation and Results

## 7.1 Test Points

1. Camera input
2. Image input
3. Video input
4. Detection quality
5. Tracking continuity
6. Analytics generation
7. Advisory fallback
8. Dashboard streaming

## 7.2 Test Plan

Suggested checks:
1. Launch dashboard successfully
2. Display live camera feed
3. Process uploaded image/video
4. Show annotated detections
5. Compute traffic metrics
6. Trigger fallback when YOLO or API is unavailable

## 7.3 Test Result

[TO BE FILLED MANUALLY with screenshots, observations, and result table]

Sample result note:
The system successfully launched the dashboard, processed traffic input, displayed annotated detections, and generated congestion analytics. When online advisory was unavailable, the rule-based fallback continued to provide traffic suggestions. This shows that the architecture is functional and resilient.

## 7.4 Insights

1. Mixed traffic requires weighted analytics, not simple counting.
2. Camera-based monitoring can reduce infrastructure cost.
3. Fallback mechanisms improve operational reliability.
4. Dashboard visibility is necessary for practical decision support.
5. Region-specific model training can further improve recognition accuracy.

# Chapter 8 Social, Legal, Ethical, Sustainability and Safety Aspects

## 8.1 Social Aspects

The system can improve traffic flow, reduce commuter delay, and support better urban mobility management. However, public trust depends on transparent and responsible use of camera-based monitoring.

## 8.2 Legal Aspects

If deployed with real traffic cameras, the system should comply with data privacy and video-handling regulations. Footage retention, access control, and responsible data use must be defined.

[TO BE FILLED MANUALLY with legal citations if required]

## 8.3 Ethical Aspects

The project should support human operators rather than replace accountable human judgment. Bias in detection accuracy across vehicle classes and road conditions must be acknowledged and handled responsibly.

## 8.4 Sustainability Aspects

By reducing unnecessary waiting and idling, the system can indirectly reduce fuel waste and emissions. A software-first approach also minimizes added physical infrastructure.

## 8.5 Safety Aspects

The project supports safety by highlighting congestion, heavy-vehicle clustering, and pedestrian spillover. Still, it should not be used as a fully autonomous controller without human oversight.

# Chapter 9 Conclusion

This project developed a Smart Traffic Management System for Urban Congestion using computer vision, analytics, and AI-assisted recommendations. The prototype supports camera, image, and video inputs; computes corridor-level traffic conditions; displays annotated results through a dashboard; and continues functioning through detector and advisor fallback mechanisms.

The system meets the main objectives of real-time traffic monitoring, analytics generation, and decision support. Future improvements can include custom Indian traffic datasets, multi-junction coordination, emergency vehicle prioritization, and wider field validation.

# References

[TO BE FILLED MANUALLY in Harvard style]

# Base Paper

[TO BE FILLED MANUALLY]

# Appendix

Suggested appendix items:
1. Dashboard screenshots
2. Annotated traffic frames
3. Test evidence
4. Similarity report
5. Dataset details
6. Additional project images

# Manual Items Checklist

1. Student names, IDs, guide name, department details, month, and year
2. Official bonafide certificate and declaration text
3. Real congestion statistics with citations
4. Literature review with real papers
5. Timeline and budget
6. Block diagram and flowchart
7. Hardware specifications
8. Screenshots and test results
9. Figure captions, table captions, and in-text citations
10. References in Harvard style
11. Base paper
12. Appendix material

# Formatting Notes

1. Times New Roman throughout
2. Chapter heading 18 pt
3. Section heading 16 pt
4. Sub-section heading 14 pt
5. Body text 12 pt
6. Chapter headings centered
7. Section headings left aligned
8. Body text justified
9. New page for each chapter
10. Roman numerals for front matter and Arabic numerals for main chapters
