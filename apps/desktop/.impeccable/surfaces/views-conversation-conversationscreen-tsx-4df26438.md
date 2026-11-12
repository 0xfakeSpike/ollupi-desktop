---
version: 1
slug: "views-conversation-conversationscreen-tsx-4df26438"
primary_target: "src/renderer/src/views/conversation/ConversationScreen.tsx"
related_targets: ["src/renderer/src/views/sidebar/Sidebar.tsx"]
---

# Surface brief: the conversation screen and the sidebar

Scope: the desktop app's working shell. Mode: Operate. Audience, job and constraints are in PRODUCT.md.

## Direction contract

THESIS: A guide map for your own errands. Each workspace is an area you recognise by its colour at a glance; inside a conversation the result comes first and the work behind it folds into one plain sentence. It refuses the category default of a grey list beside a transcript of commands, paths, models and token counts the person has to read to know where things stand.

OWN-WORLD: Stone and moss. Ground #EEEDE8, canvas #F8F7F4 as one large rounded sheet (28px) inset on the ground; ink #22252A, #5E626A, #8D9098. Workspace areas are flat muted fields (moss #BCCBB4, mist #BFCCD6, heather #CFC7DB, and more of that family) with 26px corners. Actions are deep moss #263B30 capsules; one signal, ochre red #D2603A with #F6E1D7, only for "needs you". Manrope with the system Chinese face, three sizes, weight carries rank. Capsule chips, no hairline boxes.

STORY: The person comes back, sees in the sidebar which area has something waiting, opens it, reads what was done and the file it made, nods once at the one question, and leaves again.

FIRST VIEWPORT: Sidebar on the ground: the "new" capsule with search and schedule capsules beside it, then the workspace areas stacked, each a coloured field with its name, count and one-line rows whose end says only a state (waiting, working, a schedule) or a quiet time. The canvas sheet to the right: header with the area's colour chip and the title, a "1 waiting" pill and one Tools capsule that holds every panel. The flow: your words in a ground bubble; the answer as prose, the produced file as a card with Open, and "looked at 9 files, made 1 table ›" folding the process, meta on hover. An approval is a soft signal-tinted field: "needs your nod", the question in plain words, what will and will not happen, details folded, Not now / Yes for this thread / Yes ↵. The message box is a ground capsule with attach and the approval policy in plain words.

FORM: grounded challenger aww2-zoo-gardens-guide-map, fused and chosen by the user over the assigned planner (list position: challenger, competitive), palette and detail matured for adult professionals at the user's direction. seed:f0632cbb933359b4

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Dark theme palette: derived here from the light one, not shown to the user yet.
- Settings, memory, capabilities and other screens follow after this surface is accepted.
