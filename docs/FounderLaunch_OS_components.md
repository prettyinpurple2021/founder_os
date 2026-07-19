# FounderLaunch_OS Component System

**Document:** `components.md`  
**Version:** 1.0  
**Status:** Core component specification  
**Design language:** LaunchChrome™  
**Theme:** Dark-only  
**Dependencies:** `design.md`, `colors.md`

---

## 1. Purpose

This file defines how FounderLaunch_OS interface components must look, behave, and respond.

Every component must feel like part of the same operating system.

The system should be:

- bold
- polished
- interactive
- dimensional
- readable
- responsive
- unmistakably FounderLaunch_OS

Components must never look like unmodified defaults from:

- shadcn/ui
- Material UI
- Bootstrap
- Chakra UI
- Ant Design
- Tailwind UI
- generic SaaS templates

Libraries may be used for functionality, but the visible result must be fully transformed into LaunchChrome™.

---

## 2. Global Component Rules

Every primary component should use at least three of these qualities:

- dark polished surface
- chrome frame
- neon edge lighting
- beveled depth
- angular geometry
- reflective highlight
- layered shadow
- animated state change
- progress or status signal
- tactile press response

Do not apply every effect at maximum intensity.

The design target is:

> expensive, energetic, and intentional

Not:

> noisy, overloaded, and unreadable

---

## 3. Component Intensity Levels

Use intensity levels to maintain hierarchy.

### Level 1 — Utility

For:

- helper text
- plain metadata
- small internal controls
- secondary dividers
- low-priority settings

Treatment:

- dark surface
- subtle border
- no glow
- minimal motion

---

### Level 2 — Interactive

For:

- standard buttons
- inputs
- tabs
- filters
- secondary cards
- navigation items

Treatment:

- visible depth
- restrained chrome
- one accent color
- hover response
- clear active state

---

### Level 3 — Featured

For:

- major CTAs
- hero modules
- primary dashboard panels
- milestone cards
- critical metrics
- launch actions

Treatment:

- Diamond Edge™ frame
- chrome structure
- stronger glow
- animated shine
- layered depth
- dramatic active state

Only a small number of Level 3 components should appear in the same viewport.

---

## 4. Geometry

FounderLaunch_OS uses angular, mechanical geometry.

Preferred shapes:

- clipped corners
- beveled corners
- chamfered rectangles
- arrow ends
- brackets
- faceted panels
- segmented rails
- circular gauges
- hexagonal badges
- diamond details

Avoid:

- soft pill shapes everywhere
- oversized bubbly radii
- organic blobs
- plain rounded rectangles as the dominant shape

### Recommended corner values

- utility controls: `6px`
- standard cards: `8px`
- major panels: `10px` with clipped corners
- badges: angular or capsule only when semantically useful
- major CTAs: custom chamfered shape

Use CSS `clip-path` for featured components where practical.

---

## 5. Primary Button — Launch Button

The Launch Button is the flagship CTA.

Use for:

- Start Your Launch
- Launch App
- Create Launch
- Activate Founder Mode
- Continue Mission
- Deploy
- Confirm major actions

### Visual treatment

- Founder Pink Energy gradient
- chrome outer frame
- white primary label
- optional icon on the left
- forward chevron or arrow on the right
- strong but controlled pink glow
- clipped corners
- narrow reflective sweep
- subtle inner highlight

### States

#### Default

- strong pink surface
- chrome frame
- medium pink glow
- clear label

#### Hover

- glow increases
- reflective sweep crosses the surface
- button lifts `2px`
- right arrow shifts `3px`
- edge brightness increases

#### Pressed

- button compresses `1px`
- inner shadow deepens
- glow reduces momentarily
- surface darkens slightly

#### Loading

- label remains visible
- animated energy rail or ignition indicator appears
- do not use a generic spinner as the only feedback

#### Disabled

- powered-down dark chrome
- muted border
- no glow
- visible disabled label
- cursor indicates unavailable

### Example token structure

```css
.launch-button {
  background: var(--fl-gradient-pink);
  color: var(--fl-text-primary);
  border: 1px solid var(--fl-border-pink);
  box-shadow: var(--fl-glow-pink);
  clip-path: polygon(
    10px 0,
    calc(100% - 10px) 0,
    100% 10px,
    100% calc(100% - 10px),
    calc(100% - 18px) 100%,
    10px 100%,
    0 calc(100% - 10px),
    0 10px
  );
}
```

---

## 6. Secondary Button — System Button

Use for:

- Watch Demo
- Cancel
- Back
- View Details
- Explore Features
- Secondary navigation actions

### Visual treatment

- Black Chrome Surface
- chrome or lime border
- white or lime label
- restrained glow
- shallow bevel
- compact angular frame

### Hover

- border illuminates
- surface brightens
- icon or arrow activates
- slight lift

### Rule

A secondary button must never visually compete with the primary Launch Button.

---

## 7. Tertiary Button — Utility Control

Use for:

- table actions
- icon controls
- filters
- panel settings
- low-priority commands

Treatment:

- transparent or near-black surface
- subtle chrome border
- no continuous glow
- visible hover state
- clear focus ring

---

## 8. Icon Button

Use for:

- close
- expand
- settings
- favorite
- overflow
- notifications
- panel tools

Rules:

- minimum target: `44px × 44px`
- use one icon family consistently
- provide tooltip
- active state may use pink or lime
- destructive state uses Alert Red
- do not use unlabeled unfamiliar icons

---

## 9. Diamond Edge™ Panel

The Diamond Edge™ Panel is the signature FounderLaunch_OS surface.

Use for:

- hero displays
- Mission Control
- major dashboard areas
- launch summaries
- premium feature modules
- onboarding milestones
- major modals

### Required treatment

- Carbon Black base
- layered chrome frame
- angular clipped corners
- left-side lime energy
- right-side pink energy
- inner black shadow
- narrow surface highlight
- optional animated reflective sweep
- subtle atmospheric texture

### Structure

1. outer frame
2. energy edge
3. chrome rail
4. inner panel
5. content layer
6. decorative hardware layer

### Rule

Decorative hardware must never overlap readable content.

---

## 10. Standard Card

Use for:

- features
- tasks
- projects
- resources
- AI suggestions
- summaries

### Treatment

- Carbon or Black Chrome surface
- subtle chrome border
- one accent edge
- small angular corner detail
- restrained inner glow
- hover lift
- clear title and action

### Hover

- card lifts `3px`
- border brightens
- one corner detail activates
- image or icon receives subtle glow

Do not turn every standard card into a full Diamond Edge™ Panel.

---

## 11. Feature Card

Use on:

- landing page
- onboarding
- product overview
- feature discovery

Required parts:

- visual or icon
- feature title
- one-sentence explanation
- accent state
- optional arrow
- angular frame

Preferred color logic:

- alternate Pink and Lime emphasis
- use supporting colors only for special categories
- maintain consistent frame strength

---

## 12. Metric Card

Use for:

- Founder Score
- Revenue
- Active Launches
- Momentum
- Completion
- Success Rate

Required hierarchy:

1. label
2. primary value
3. status or comparison
4. optional mini visualization

### Treatment

- compact dark panel
- large bright number
- one accent color
- chrome separator
- positive delta in Launch Lime
- active or intense state in Founder Pink

### Rules

- numbers must dominate
- no unnecessary paragraph text
- use tabular numerals
- do not overload with decorative effects

---

## 13. Gauge

Use for:

- momentum
- readiness
- launch speed
- founder score
- system health

### Treatment

- circular or semi-circular
- dark inner face
- chrome tick marks
- neon active arc
- glowing endpoint
- compact label
- optional animated charge

### Motion

On load:

- gauge fills rapidly
- endpoint glows
- value counts up

Respect reduced-motion settings.

---

## 14. Progress Bar — Momentum Rail

Use for:

- launch progress
- onboarding
- mission completion
- growth milestones
- setup status

### Treatment

- recessed black track
- chrome outer edge
- Momentum Charge gradient
- glowing leading edge
- percentage or status label
- optional segmented ticks

### Motion

The bar should charge rather than simply appear filled.

Do not animate continuously after completion.

---

## 15. Navigation Rail

Use for desktop app navigation.

### Structure

- logo or emblem
- section labels
- icon + text items
- active state rail
- Founder Mode status
- utility items at bottom

### Default item

- muted text
- subtle icon
- transparent surface

### Hover item

- brighter text
- soft chrome edge
- minor lateral movement

### Active item

- Black Chrome surface
- lime or pink left rail
- illuminated icon
- strong text
- optional right chevron
- locked-in appearance

### Rules

- active state must be unmistakable
- avoid overly narrow sidebars
- labels should remain visible on desktop
- collapsed mode may use tooltips

---

## 16. Top Navigation

Use on landing pages and marketing screens.

### Treatment

- near-black translucent frame
- subtle chrome bottom rail
- logo at left
- concise nav links
- Launch App CTA at right
- angular container framing

### Rules

- no white navbar
- no excessive transparency
- keep the CTA visually dominant
- avoid oversized vertical padding
- sticky behavior may add slight blur and stronger border

---

## 17. Tabs

Tabs should feel like mode selectors.

### Treatment

- dark segmented rail
- chrome dividers
- active neon underlight
- bold active label
- compact angular shape

Use Pink for:

- active mission
- creation
- launch modes

Use Lime for:

- progress
- completion
- optimization modes

---

## 18. Input Field

Inputs must feel integrated into the operating system.

### Treatment

- recessed black surface
- chrome or graphite border
- clear label
- readable placeholder
- subtle inner shadow
- active neon edge
- angular corners

### Focus

- border illuminates
- one accent glow appears
- label brightens
- caret remains visible

### Error

- Alert Red border
- error icon
- clear text
- no shake animation unless subtle and brief

### Success

- Lime border
- check indicator
- optional short confirmation

---

## 19. Textarea

Follow input styling with:

- larger recessed field
- visible character count when relevant
- no excessive glow
- resize behavior controlled
- readable line height

---

## 20. Select and Dropdown

### Trigger

- dark recessed surface
- chrome border
- clear current value
- chevron indicator

### Menu

- Black Chrome panel
- subtle chrome frame
- active option in pink or lime
- keyboard focus visible
- selected option clearly marked

Avoid browser-default appearance.

---

## 21. Checkbox

Preferred shape:

- small angular square
- dark recessed base
- chrome border
- lime check for complete/positive
- pink check for active/premium context

Must include a clear label.

---

## 22. Radio Button

Preferred shape:

- circular mechanical control
- chrome ring
- neon center indicator
- strong selected state

Use sparingly.

---

## 23. Toggle — Power Switch

Toggles should feel like system power controls.

### Off

- black recessed track
- muted chrome knob
- no glow

### On

- neon track
- reflective knob
- small status light
- subtle glow

Use Pink for active features.

Use Lime for readiness, automation, or successful activation.

---

## 24. Badge

Badge categories:

- status
- level
- premium
- system
- achievement
- warning

### Treatment

- compact
- strong label
- angular or capsule form
- dark base
- metallic border
- controlled glow

Examples:

- READY
- EXTREME
- LEGENDARY
- AUTOPILOT ACTIVE
- LAUNCH COMPLETE
- PRO
- BETA

Do not use pastel badges.

---

## 25. Achievement Badge

Use for:

- milestones
- streaks
- founder levels
- completed launches
- growth achievements

### Treatment

- chrome or gold frame
- diamond, shield, hexagon, or medal shape
- neon core
- unique icon
- rank label
- unlock animation

Achievement Badges may be more decorative than standard UI.

---

## 26. Tooltip

Treatment:

- near-black surface
- chrome border
- small pointer
- concise text
- no heavy glow
- fast appearance
- readable at small sizes

Do not hide critical instructions only in tooltips.

---

## 27. Alert

Alert types:

- information
- success
- warning
- error
- mission update

### Structure

- icon
- title
- concise description
- optional action
- close control

### Treatment

- dark panel
- semantic accent rail
- chrome structure
- readable copy
- restrained glow

---

## 28. Toast Notification

Toasts should feel like incoming system transmissions.

### Motion

- dock from top-right or bottom-right
- brief edge illumination
- settle into place
- exit cleanly

### Rules

- no excessive stacking
- include dismiss control
- use concise copy
- important actions require persistent UI elsewhere

---

## 29. Modal

Modals should feel deployed, not floated casually.

### Treatment

- dark overlay
- Diamond Edge™ or chrome frame
- angular panel
- clear title
- visible close control
- one dominant action
- secondary action visually quieter

### Motion

- rapid scale and dock
- brief chrome sweep
- no slow fade-only presentation

---

## 30. Command Palette

The command palette is a core OS component.

### Treatment

- wide Black Chrome panel
- strong chrome frame
- search field at top
- keyboard shortcut hints
- grouped actions
- active result in Founder Pink or Launch Lime
- subtle background grid

### Language

Use commands such as:

- Launch Project
- Open Mission Control
- Activate Autopilot
- View Founder Vault
- Continue Mission

---

## 31. Table

Tables must remain usable despite the visual style.

### Treatment

- black surface
- chrome header rail
- clear row separators
- active row highlight
- compact status badges
- readable alignment
- restrained accent use

### Rules

- no glow on every row
- support sticky headers
- support horizontal scrolling on mobile
- use tabular numerals for data
- actions should remain discoverable

---

## 32. Accordion

### Treatment

- dark framed row
- chrome divider
- clear expand indicator
- active neon edge
- content reveals inside recessed panel

Avoid excessive motion.

---

## 33. Breadcrumb

Use for deep application structure.

Treatment:

- muted text
- chrome or lime separators
- current item brighter
- no unnecessary container

---

## 34. Pagination

Use:

- compact angular controls
- clear current page
- chrome border
- restrained active glow
- disabled powered-down state

---

## 35. Empty State

Empty states must motivate action.

Required parts:

- strong visual or icon
- clear title
- useful explanation
- one primary CTA
- optional next-step guidance

Preferred language:

- Ready for Your First Launch?
- No Missions Yet
- Your Vault Is Ready
- Activate Your First Workflow
- Build Momentum Here

Avoid:

- No data found
- Nothing here
- Empty list

---

## 36. Loading State

Loading must feel like the system is working.

Approved treatments:

- charging rail
- rotating mechanical ring
- scanning line
- pulsing launch core
- segmented progress
- logo ignition animation

Avoid:

- plain gray skeletons with no brand styling
- endless large spinners
- distracting full-screen effects

Skeletons may use Black Chrome surfaces and moving chrome highlights.

---

## 37. Error State

Error states should be direct and recoverable.

Required:

- clear error title
- human-readable explanation
- next action
- retry or support option
- Alert Red accent
- no blame language

Example:

> Launch sequence interrupted. Your work is safe. Retry the connection or return to Mission Control.

---

## 38. Success State

Success should feel rewarding.

Use:

- lime charge
- chrome highlight
- milestone animation
- optional gold reward
- clear next step

Example:

> Mission Complete. Your launch plan is ready.

Avoid excessive confetti for routine actions.

---

## 39. Dashboard Module

A dashboard module should contain:

- title
- status
- primary content
- optional secondary control
- clear hierarchy
- one accent family

Use Diamond Edge™ only for high-priority modules.

Standard modules should remain calmer.

---

## 40. Mission Card

Use for:

- tasks
- objectives
- launch steps
- founder actions

Required:

- mission title
- status
- priority
- estimated effort or due date when relevant
- progress state
- completion control

### Completion interaction

- control illuminates
- card briefly charges
- status changes visibly
- progress updates
- optional small reward response

---

## 41. Autopilot AI Card

Use for:

- AI recommendations
- automated actions
- generated plans
- strategic insights

### Treatment

- Hyper Cyan or Plasma Violet support accent
- Founder Pink for actionable CTA
- Black Chrome surface
- AI status indicator
- clear explanation of what the AI did
- explicit approval controls

Never make AI actions ambiguous.

---

## 42. Founder Vault Card

Use for:

- documents
- credentials
- assets
- saved plans
- protected resources

### Treatment

- Black Chrome
- Launch Lime security accents
- mechanical lock icon
- strong category label
- clear access state
- restrained glow

---

## 43. Victory Zone Component

Use for:

- achievements
- streaks
- completed launches
- wins
- milestones

### Treatment

- Founder Pink + Victory Gold
- trophy or diamond icon
- premium chrome frame
- celebratory motion
- ranked presentation
- visible progress toward next reward

---

## 44. Landing Page Hero Module

Required parts:

- brand navigation
- strong metallic headline
- concise supporting copy
- primary pink CTA
- secondary lime or chrome CTA
- logo or signature visual stage
- atmospheric background
- trust or proof signal
- visible momentum metric when appropriate

### Rules

- hero must dominate first viewport
- logo must not sit inside a white box
- headline should feel dimensional
- CTA must be immediately visible
- atmosphere must remain behind content
- avoid generic centered SaaS hero structure

---

## 45. Responsive Component Rules

### Desktop

- full framing
- visible hardware details
- layered states
- larger gauges
- stronger motion

### Tablet

- reduce decorative rails
- simplify multi-column cards
- preserve chrome and neon identity
- maintain touch target size

### Mobile

- one priority action at a time
- simplify frame complexity
- reduce glow radius
- reduce continuous motion
- stack metric cards
- preserve angular geometry
- keep text large and readable

Do not convert mobile components into plain white or generic cards.

---

## 46. Accessibility Rules

All components must include:

- keyboard support
- visible focus state
- semantic labels
- accessible names
- sufficient contrast
- non-color status indicators
- reduced-motion behavior
- touch targets of at least `44px`
- clear disabled state
- readable error messages

Focus treatment should combine:

- chrome outline
- pink or lime accent
- visible thickness
- sufficient contrast

---

## 47. Motion Timing Defaults

These are baseline values.

- hover response: `120ms–180ms`
- press response: `80ms–120ms`
- panel reveal: `220ms–320ms`
- modal deploy: `240ms–360ms`
- toast dock: `200ms–280ms`
- gauge charge: `500ms–900ms`
- milestone celebration: `700ms–1400ms`

Do not make routine interactions feel slow.

---

## 48. Component Approval Checklist

Before approving a component, confirm:

1. Does it look custom rather than library-default?
2. Is the hierarchy obvious?
3. Does it use the correct intensity level?
4. Is the geometry angular enough?
5. Is chrome reflective rather than gray?
6. Is neon used with purpose?
7. Does the component have a clear hover state?
8. Does the pressed state feel tactile?
9. Is it readable?
10. Is it keyboard accessible?
11. Does it support reduced motion?
12. Does it match the approved landing-page direction?
13. Is it flashy without becoming cluttered?
14. Would it still feel like FounderLaunch_OS without the logo?

If the answer to questions 1, 2, 5, 9, 10, or 12 is “no,” the component is not ready.

---

## 49. AI Component Directive

Use this instruction when generating components with AI tools:

> Build this component using the FounderLaunch_OS LaunchChrome™ component system. Use a dark-only Black Chrome surface, angular or clipped geometry, reflective chrome structure, one dominant neon accent, visible depth, responsive hover and press states, and premium game-inspired interaction. Use Diamond Edge™ framing only for high-priority components. The result must feel custom, cinematic, tactile, readable, and unmistakably FounderLaunch_OS. Do not output default shadcn, Material, Bootstrap, Tailwind UI, plain rounded cards, white surfaces, pastel styling, generic SaaS controls, or excessive glow.

---

## 50. Final Standard

Every component must contribute to the feeling that FounderLaunch_OS is a real operating system for founders.

The interface should not merely display information.

It should:

- guide action
- reinforce momentum
- reward progress
- communicate status
- feel alive
- create confidence

The final rule is:

> Flashy does not mean cluttered. Every effect must earn its place.
