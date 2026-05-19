# Feature Spec: Customer-Facing Table Groups in Booking Flow

**Project:** Mucha Kitchen Reservations
**Date:** 2026-05-20
**Author:** UX Designer / Agent Fleet
**Status:** Draft → Ready for Implementation

---

## 1. Problem Statement

Customers booking for parties >2 guests cannot see table groups on the floor plan. Staff create table groups (e.g., T1+T2 combined for 4 guests), but these groups are invisible to customers. Result: customers see only individual 2-seat tables, get confused about seating arrangements, or abandon bookings.

**Current behavior:** Customer sees individual tables. Groups don't exist in customer view.
**Desired behavior:** Customer sees both individual tables AND table groups, clearly differentiated.

---

## 2. User Stories

| ID | Story | Priority |
|----|-------|----------|
| US-1 | As a customer with a party of 4, I want to see table groups on the floor plan so I can book a spot that fits my group | P0 |
| US-2 | As a customer, I want table groups to look visually different from individual tables so I don't confuse them | P0 |
| US-3 | As a customer, I want to know which individual tables make up a group before I confirm my selection | P0 |
| US-4 | As a customer booking on mobile, I want the floor plan to be usable with pinch-to-zoom so I can navigate easily | P1 |
| US-5 | As a customer, I want unavailable tables visible but greyed out so I understand the full layout | P1 |

---

## 3. Acceptance Criteria

### AC-1: Table Groups Visible on Floor Plan
**Given:** A table group exists (e.g., T1+T2 combined for 4 guests)
**When:** Customer reaches "Choose my table" step
**Then:** The group appears as a unified shape on the floor plan

### AC-2: Visual Differentiation
**Given:** Both individual tables and table groups exist
**When:** Customer views the floor plan
**Then:** Groups have distinct styling from individual tables:
- Dashed border (not solid)
- "Group" label + combined capacity
- Light shaded background behind grouped tables
- Individual tables within group are NOT separately clickable

### AC-3: Group Selection Confirmation
**Given:** Customer clicks a table group
**When:** Selection is made
**Then:** Details panel shows:
- Group name (auto-generated or staff-defined)
- Combined tables (e.g., "Tables T1 + T2")
- Total capacity
- Warning: "These tables will be joined and cannot be split"

### AC-4: Filtered by Party Size
**Given:** Customer has party size = 2
**When:** Floor plan renders
**Then:** Groups with capacity >2 are greyed out (unsuitable)
**And:** Individual tables remain clickable

### AC-5: Unavailable Tables Visible
**Given:** Some tables are booked
**When:** Floor plan renders
**Then:** Booked tables appear in red with opacity
**And:** Customer can see but not click them

---

## 4. Technical Requirements

### API Changes

#### `GET /api/tables/availability`
**Current response:**
```json
{
  "tables": [...],
  "floorObjects": [...]
}
```

**Required response:**
```json
{
  "tables": [...],           // Individual tables
  "tableGroups": [            // NEW
    {
      "id": "group-uuid",
      "name": "Table Group A",
      "tableIds": ["t1", "t2"],
      "combinedCapacity": 4,
      "x": 100,
      "y": 100,
      "width": 120,
      "height": 60,
      "status": "available"
    }
  ],
  "floorObjects": [...]
}
```

**Calculation:**
- Group bounds = bounding box of member tables + 10px padding
- Group status = "available" if ALL member tables are available for the time slot
- Group status = "booked" if ANY member table is occupied

### Frontend Changes

#### `table-selector.tsx`
1. Accept `tableGroups` prop
2. Render groups as unified SVG shapes with dashed borders
3. Make groups clickable (single target, not individual tables)
4. Update legend: add "Table Group" entry

#### Selection Logic
- Click individual table → select that table
- Click group → select entire group (cannot select individual tables within)
- Store selected group ID separately from selected table ID

#### Details Panel (Post-Selection)
```
Selected: Table Group A (4 seats)
Tables: T1 + T2
Area: Main Dining
⚠️ These tables will be joined for your party
[Change] [Confirm Table]
```

### Database
- No schema changes required
- `TableGroup` and `TableGroupMember` models already exist
- Query: `prisma.tableGroup.findMany({ include: { members: { include: { table: true } } } })`

---

## 5. UX Design Details

### Visual Design

#### Table Group Rendering
```
┌─────────────────────────────┐
│  ┌────┐    ┌────┐          │  ← light fill (#e0e7ff)
│  │ T1 │    │ T2 │          │  ← individual tables shown
│  └────┘    └────┘          │     with dashed outline
│                             │
│  Table Group A  • 4 seats  │  ← label centered below
└─────────────────────────────┘
      ↑ dashed border
```

**Styling:**
- Border: `stroke-dasharray="4 2"`, color `#4f46e5`
- Fill: `fill="#e0e7ff"`, opacity `0.3`
- Label: font-size 10, color `#1e293b`, font-weight 600

#### Legend Update
```
🟢 Available  🔴 Booked  ⚪ Not suitable  ━┅━ Table Group
```

### Interaction Flow

```
Customer reaches "Choose my table"
    ↓
Sees floor plan with tables + groups
    ↓
Clicks a table group
    ↓
Group highlights (blue border)
Individual tables within group highlight together
    ↓
Details panel shows group composition + warning
    ↓
Customer clicks "Confirm Table"
    ↓
Reservation created with tableGroupId
```

### Mobile Considerations
- Floor plan pinch-to-zoom (already partially supported)
- List view toggle: "Switch to List" for accessibility
- Bottom sheet for details (not sidebar)
- Minimum tap target: 44px

---

## 6. Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Group partially booked | Group shown as booked, individual tables shown separately if one is free |
| Group overlaps with floor object | Group renders on top (z-index logic) |
| Party size changes after group selected | If party size decreases, group remains valid. If increases beyond capacity, show error |
| Staff deletes group mid-booking | Handle gracefully — show "This table group is no longer available" |
| Single table in group is selected by another user | Real-time refresh via existing 15s polling |

---

## 7. Testing Criteria

### Manual QA Checklist
- [ ] Create table group (staff), verify it appears on customer floor plan
- [ ] Book group, verify individual tables within show as booked
- [ ] Party of 2: groups greyed out, individual tables available
- [ ] Click group → details show composition + warning
- [ ] Confirm group booking → reservation has correct tableGroupId
- [ ] Mobile: pinch zoom works, taps register correctly
- [ ] Screen reader: "Table group, 4 seats, combining tables T1 and T2"

---

## 8. Implementation Order

1. **Backend:** Update `/api/tables/availability` to include `tableGroups`
2. **Frontend:** Render groups in `table-selector.tsx`
3. **Frontend:** Selection logic for groups
4. **Frontend:** Details panel for group selection
5. **QA:** Test all edge cases

---

## 9. Out of Scope

- Group creation in customer UI (staff-only feature)
- Dynamic group suggestions ("You need 4 seats — combine T1+T2?")
- Group pricing/surcharges
- Customer ability to request specific table arrangements

---

**Next Step:** Spawn implementation agents for Backend (API) and Frontend (UI) tasks.
