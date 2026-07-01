---
name: Zenith Personal Growth
colors:
  surface: '#f8f9ff'
  surface-dim: '#c9dbf9'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff3ff'
  surface-container: '#e6eeff'
  surface-container-high: '#dde9ff'
  surface-container-highest: '#d4e3ff'
  on-surface: '#091c33'
  on-surface-variant: '#564335'
  inverse-surface: '#203149'
  inverse-on-surface: '#ebf1ff'
  outline: '#897362'
  outline-variant: '#dcc2af'
  surface-tint: '#8f4d00'
  primary: '#8f4d00'
  on-primary: '#ffffff'
  primary-container: '#f28705'
  on-primary-container: '#592e00'
  inverse-primary: '#ffb77b'
  secondary: '#406087'
  on-secondary: '#ffffff'
  secondary-container: '#b1d1fe'
  on-secondary-container: '#395a80'
  tertiary: '#b12e00'
  on-tertiary: '#ffffff'
  tertiary-container: '#ff7b55'
  on-tertiary-container: '#6e1900'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdcc2'
  primary-fixed-dim: '#ffb77b'
  on-primary-fixed: '#2e1500'
  on-primary-fixed-variant: '#6d3a00'
  secondary-fixed: '#d2e4ff'
  secondary-fixed-dim: '#a8c9f5'
  on-secondary-fixed: '#001c37'
  on-secondary-fixed-variant: '#27486e'
  tertiary-fixed: '#ffdbd1'
  tertiary-fixed-dim: '#ffb5a0'
  on-tertiary-fixed: '#3b0900'
  on-tertiary-fixed-variant: '#872100'
  background: '#f8f9ff'
  on-background: '#091c33'
  surface-variant: '#d4e3ff'
typography:
  display-lg:
    fontFamily: Noto Sans JP
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Noto Sans JP
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.3'
  headline-lg-mobile:
    fontFamily: Noto Sans JP
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.4'
  headline-md:
    fontFamily: Noto Sans JP
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.4'
  title-lg:
    fontFamily: Noto Sans JP
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.5'
  body-lg:
    fontFamily: Noto Sans JP
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.7'
  body-md:
    fontFamily: Noto Sans JP
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.7'
  label-md:
    fontFamily: Noto Sans JP
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  caption:
    fontFamily: Noto Sans JP
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

The design system is engineered for a Japanese personal growth platform tailored to software engineers. The brand personality is **Calm, Encouraging, and Methodical**. It avoids the aggressive "hustle culture" aesthetic in favor of a "Friendly-Premium" atmosphere that feels like a quiet, high-end workspace.

The design style is **Modern Corporate with Tactile Warmth**, characterized by:
- **Generous Whitespace:** Promoting mental clarity and focus.
- **Soft Precision:** Using hairline borders and extremely soft shadows to define structure without adding visual noise.
- **Intentional Contrast:** A deep navy foundation paired with warm, high-energy accents to guide the eye toward growth-oriented actions.
- **Localization:** Deeply optimized for Japanese typesetting, ensuring vertical rhythm and legibility are maintained across complex kanji and kana strings.

## Colors

The palette balances the coolness of an engineering environment with the warmth of personal achievement.

- **Foundational Neutrals:** The background uses a tinted off-white (#F5F8FC) to reduce eye strain, while Deep Navy (#172940) provides a sturdy structural anchor for text and navigation.
- **The Growth Gradient:** Actionable elements utilize an intensity scale from **Peach (#F2BBA7)** for soft highlights to **Primary Orange (#F28705)** for critical CTAs.
- **Semantic Accents:** Amber (#F29F05) is reserved for secondary progress, while Red-Orange (#F24405) is used sparingly for high-emphasis achievements or notifications.
- **Borders:** Use the Hairline color (#DCE3EC) for all card boundaries and dividers to maintain a "clean-tech" feel.

## Typography

The design system relies exclusively on **Noto Sans JP** to provide a modern, humanist feel that is highly legible for technical content. 

- **Line Height:** Japanese characters require slightly more breathing room than Latin characters; a default of 1.7x for body text ensures a comfortable reading experience for long-form reflection or log entries.
- **Weight Strategy:** Use Bold (700) for headlines to create clear hierarchy against the navy text color. Medium (500) is preferred for labels and UI metadata to maintain distinction without the "heaviness" of a full bold.
- **Letter Spacing:** Headlines should have slight negative tracking (-0.02em) to feel tighter and more professional, while small labels benefit from slight tracking (+0.02em) for clarity.

## Layout & Spacing

This design system employs a **12-column fluid grid** for desktop and a **4-column grid** for mobile.

- **The 8px Rhythm:** All spacing (padding, margins, gaps) must be a multiple of the 4px base unit, with a preference for 8px increments.
- **Container Strategy:** Content should be centered in a max-width container of 1200px for readability.
- **Card Spacing:** Internal padding for cards is strictly 24px (md) to maintain the "generous whitespace" brand promise.
- **Adaptive Rules:** On mobile, margins reduce to 16px and vertical stack spacing increases slightly to provide a larger touch target and clearer separation of ideas.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layering** combined with ultra-subtle shadows.

- **Base Layer:** The App Background (#F5F8FC) serves as the lowest depth.
- **Surface Layer:** Cards and primary containers sit on the Surface (#FFFFFF). 
- **Shadow Definition:** Use a single, soft "Ambient Shadow" for elevated cards: `0px 4px 20px rgba(23, 41, 64, 0.05)`. The shadow should feel more like a soft glow than a hard drop shadow.
- **Interactive Depth:** On hover, cards do not lift higher; instead, their 1px hairline border shifts from #DCE3EC to the Slate Blue (#7595BF) and the background may subtly transition to the Secondary Surface (#E4EBF2).

## Shapes

The shape language is defined by **Soft Geometric Consistency**.

- **Primary Radius:** Cards and large containers use a fixed **10px corner radius**. This specific value bridges the gap between "standard" (8px) and "playful" (12px+), reinforcing the friendly-premium aesthetic.
- **Small Elements:** Buttons and input fields should follow the `rounded-lg` (16px) standard for a softer, more inviting interactive feel.
- **Iconography:** Use icons with rounded terminals and consistent stroke weights (1.5px or 2px) to match the hairline border thickness.

## Components

- **Buttons:** 
  - **Primary:** Background #F28705 with #172940 text. High contrast is essential here. 
  - **Secondary:** Transparent background, 1px border #7595BF, text #7595BF.
  - **Ghost:** No border, text #7595BF, Background #E4EBF2 on hover.
- **Cards:** White background, 1px #DCE3EC border, 10px radius, soft 5% navy shadow.
- **Input Fields:** 1px #DCE3EC border, 8px radius. On focus, the border changes to #7595BF with a 2px outer glow of #F2BBA7 at 30% opacity.
- **Chips/Tags:** Use #E4EBF2 background with #7D8B8C text for neutral tags. Use #F2BBA7 with #172940 text for active/highlighted filters.
- **Progress Bars:** Background #E4EBF2, fill #F28705. For "Strong Emphasis" goals, use #F24405.
- **Lists:** Clean rows separated by 1px #DCE3EC hairlines. Interactive list items should use a #F5F8FC hover state with a 4px left-edge accent in #7595BF.