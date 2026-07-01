---
name: Hydrologic Precision System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#44474d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#525f77'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#0e1c31'
  on-primary-container: '#77849e'
  inverse-primary: '#bac7e3'
  secondary: '#00677f'
  on-secondary: '#ffffff'
  secondary-container: '#00d2ff'
  on-secondary-container: '#00566a'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002020'
  on-tertiary-container: '#289291'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3ff'
  primary-fixed-dim: '#bac7e3'
  on-primary-fixed: '#0e1c31'
  on-primary-fixed-variant: '#3a475e'
  secondary-fixed: '#b6ebff'
  secondary-fixed-dim: '#47d6ff'
  on-secondary-fixed: '#001f28'
  on-secondary-fixed-variant: '#004e60'
  tertiary-fixed: '#93f2f2'
  tertiary-fixed-dim: '#76d6d5'
  on-tertiary-fixed: '#002020'
  on-tertiary-fixed-variant: '#004f4f'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  gutter: 24px
  margin: 32px
---

## Brand & Style

The design system is engineered to project **absolute reliability, technical authority, and calm under pressure**. As a tool for government disaster management, the aesthetic avoids the fleeting trends of consumer SaaS in favor of a "Mission Control" ethos—refined, high-density, and utilitarian.

The style is a hybrid of **Modern Corporate** and **Functional Minimalism**, utilizing subtle **Glassmorphism** for data overlays to maintain a sense of depth without sacrificing legibility. Every visual decision prioritizes the rapid scanning of critical information. The emotional response should be one of "controlled urgency"—providing the user with the confidence that the data is accurate and the system is stable during high-stakes environmental events.

## Colors

This design system utilizes a high-contrast palette optimized for clarity and situational awareness. 

- **Primary & Foundation:** Deep Navy (#0B192E) serves as the "Anchor," used for navigation, headers, and primary text to establish authority. 
- **Accents:** Aqua and Cyan are reserved for interactive elements, data visualization, and "active" states, cutting through the neutral background.
- **Semantic Logic:** Status colors (Green, Amber, Red) must adhere strictly to their safety meanings. In high-stress scenarios, these colors are paired with icons to ensure accessibility for color-blind operators.
- **Background Tones:** The light blue-gray (#F8FAFC) reduces eye strain during long monitoring shifts while providing enough contrast for white cards and translucent overlays.

## Typography

The design system relies exclusively on **Inter** for its neutral, systematic, and highly legible characteristics. 

- **Hierarchy:** Large display sizes are used for critical metrics (e.g., water levels). 
- **Caps & Spacing:** `label-sm` uses uppercase with increased letter spacing for secondary metadata and table headers to differentiate from body text.
- **Numerical Data:** For tabular data and coordinates, ensure the use of tabular (monospaced) figures to keep numbers aligned for easier comparison during rapid fluctuation.

## Layout & Spacing

This design system employs a **12-column fluid grid** for desktop monitoring dashboards, shifting to a single-column layout for mobile alerts. 

- **Grid Logic:** Use 24px gutters to provide significant breathing room between dense data sets. 
- **Density:** While the overall layout is airy, internal card padding should be set to `md` (16px) or `lg` (24px) to maximize the information density of charts and maps.
- **Breakpoints:** 
  - Desktop: 1280px+ (12 columns)
  - Tablet: 768px - 1279px (8 columns)
  - Mobile: <767px (4 columns, reduced margins)

## Elevation & Depth

Visual hierarchy is managed through a combination of **Tonal Layering** and **Soft Shadows**. 

1.  **Level 0 (Floor):** The light blue-gray background (#F8FAFC).
2.  **Level 1 (Cards):** Pure white surfaces with a 1px border (#E2E8F0) and a subtle, diffused shadow (0px 4px 20px rgba(11, 25, 46, 0.05)).
3.  **Level 2 (Overlays/Popovers):** Semi-transparent white with a 12px backdrop-blur (Glassmorphism). This is used for map legends and non-modal tooltips to maintain environmental context.
4.  **Level 3 (Modals/Alerts):** High-contrast elements with a stronger shadow cast to demand immediate attention during critical warnings.

## Shapes

The shape language balances professional structure with modern approachability. 

- **Primary Radius:** Standard containers and input fields use 0.5rem (8px). 
- **Large Components:** Dashboard cards and main content areas utilize a more pronounced `rounded-2xl` (1rem or 16px) to create a distinct, modern containerized look. 
- **Buttons:** Use the standard 0.5rem radius to maintain a precise, clickable appearance. Avoid pill-shapes to keep the aesthetic "technical" rather than "casual."

## Components

- **Buttons:** Primary buttons use Navy (#0B192E) with white text. Secondary buttons use a subtle Cyan tint with Navy text. Emergency buttons (e.g., "Issue Warning") use a solid Red (#EF4444).
- **Cards:** White background, 16px border-radius, and 1px border (#E2E8F0). Header sections within cards should have a subtle bottom border.
- **Chips/Badges:** For status monitoring (e.g., "Sensor Active"), use small, semi-transparent background fills with dark text (e.g., light green background with dark green text).
- **Input Fields:** 1px border, 8px radius. Active states should use an Aqua Blue (#00D2FF) glow/ring.
- **Icons:** Use Lucide-style 2px stroke-width icons. Icons should be monochrome (Navy) for navigation and colored only when representing status or specific data types (e.g., Blue for rain, Red for alerts).
- **Alert Banner:** A full-width component at the top of the viewport. During "Critical" events, this banner should pulse subtly between #EF4444 and #B91C1C to ensure it is never ignored.