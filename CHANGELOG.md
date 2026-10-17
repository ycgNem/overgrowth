# Patch notes

## 1.0.3: Iron and Order (2026-10-17)

- **The satchel is easier to handle.**
  - Drag a stack onto any slot, on either side. Drag it off the satchel to drop it.
  - Click a stack to send it across: into the open Coffer or container, or back out. With nothing open, a click moves it between your belt and your pack.
  - Hold Ctrl for half a stack. Hover a stack and press 1–8 to put it on that belt slot.
  - A Sort button tidies your pack, and another tidies the Coffer.
- **Dropping things works properly.**
  - Right-click drops one from the stack you clicked, not your biggest stack. Shift+right-click drops the whole stack.
  - What you drop lands as one pile and stays on the ground. It no longer flies back into your satchel; look at it and tap E to pick it up again.
- **Right-click with the Coffer or a container open** moves one across in either direction. Shift moves the whole stack.
- **Dragging onto a different item** swaps the two when both fit.
- **Salvaging a defence is a held right-click.** A ring fills on the slot, so one stray click no longer breaks a tower down.
- **The Coffer can be upgraded.**
  - Clad it in iron for 90 slots: 4 scrap metal, 4 rusty bolts, 2 bog iron.
  - Bind it in brass for 120 slots: 3 copper wire, 6 scrap metal, 4 rusty bolts, 3 bog iron.
  - The upgrade is a button in the Coffer, and each level shows on the chest itself.
- **The camp faces you.** The Coffer, the Workbench, the Fire Pit and the Tinker's Bench now face out toward you as you come in from the forest, not toward the Heartwood.
- **The Blight are 20% tougher.** Every kind has a fifth more health and hits a fifth harder, on every difficulty, bosses included.
- **Fewer stutters at dawn and when the day starts.**
  - Ground wear, regrowth and grass are rebuilt over several frames, nearest first, so nothing pops out and back.
  - Blooms sprout one per frame, and the autosave and records no longer land on the same frame as the day banner.
  - Shader programs are kept instead of being thrown away and rebuilt each dawn.
  - On a CPU throttled to a quarter speed, the worst dawn frame went from about 200 ms to about 65 ms.

## 1.0.2: Smooth Going (2026-10-16)

- **No more random freezes.** The game used to stop for up to half a second the first time
  you held a defence, the first time each kind of loot dropped, and the first time you held a
  poultice, smoked eel or the slingshot. All of that is now prepared on the loading screen.
- **Crafting out in the forest works again.** Field recipes (traps, poultices, firepots,
  ammo) could fail with an error away from camp.
- **The belt takes anything.** Move materials and salvage onto the belt when the pack is
  full; new finds use empty belt slots once the pack runs out of pockets. What you use from
  the belt still stays with you when you fall, but materials, salvage and relics on it drop
  with the pack.
- **Full pack? The game says so.** Standing over something you can't carry tells you
  whether you're out of pockets or it's too heavy.
- **Smashed-crate loot comes to you**, like a searched crate's does, so nothing lands out
  of reach.
- **River clay looks like clay.** A smooth red-brown slab, no longer a grey lump you could
  mistake for a stone.
- **The slingshot goal** in the journal no longer asks you to craft one when you already have
  one.

## 1.0.1: Lighter Loads (2026-10-15)

- **Everything weighs about half as much.** The heavy things lost the most: a log is 1.5 kg
  (was 4), a stone 0.4 kg (was 1), bog iron, scrap metal and batteries well under a kilo,
  and built defences 0.5 to 2 kg.
- **Bigger packs.** The Woven Satchel carries 25 kg (was 20), the Hide Pack 32 kg (was 26)
  and the Explorer's Rucksack 40 kg (was 32). A full day's foraging now fits before you're
  encumbered.
- **Smashed crates spill their loot.** Breaking a crate, urn or chest with the machete used
  to make it vanish with the loot still locked inside where you couldn't see it. Now
  everything in it spills out onto the ground where it stood. Fragile things can still break.

## 1.0: The Lost Expedition (2026-10-15)

Four planned updates (Pack and Cache, Hard Ground, The Lost Expedition and The Long Tail) in
one release. Days are now a scavenging run: you search containers, weigh what to carry and
get it home before dusk. Defence is a budget you spend, against Blight that look for your
weak side. A story runs through the ten nights and gives you most of the new tools, and the
game is finished off with accessibility options, gamepad support, achievements, a daily
vigil and smaller downloads.

### Pack and Cache: the day is a raid
- **Weight.** Everything you carry weighs something. Your pack holds 20 kg comfortably:
  - Past 70% you're **Laden**: a little slower, and sprinting tires you faster.
  - Past 100% you're **Encumbered**: no sprinting, a slow walk, low jumps and loud feet.
  - At 130% nothing more goes in.
  - The weight bar is in the satchel, and every item shows its weight.
- **The Coffer.** A root-bound chest at camp with 60 slots and no weight limit. Shift-click
  to move a stack, or store every material in one go. In camp, crafting draws from the
  satchel and the Coffer together.
- **Benches.** Towers, walls and packs are made at the Workbench. Braziers, mortars and clay
  work need the Fire Pit, and totems and scrap work need the Tinker's Bench. Field recipes
  (traps, poultices, firepots, ammo) still work anywhere. Each bench has three levels, and a
  bench's level is the highest tier you can upgrade what's made there to.
- **Containers you search.** Crates, explorer's packs, field lockers, urns, temple
  reliquaries, sunken chests and new **root caches** hidden in buttress roots:
  - Opening one shows its slots, and they reveal one by one, slower for rarer things.
  - Take items one at a time, or everything with R. Leave something and it's still there
    when you come back.
  - Locked chests need a **pry bar**, or a long, loud forced opening.
  - Some containers fill again at dawn.
- **Dying by day costs your pack.** It drops where you fell as a **lost satchel** with a
  beacon. Get back to it before the horn or it's gone. Your belt and the **Safe Pouch** stay
  with you, and dying at night inside the camp drops nothing. Verdant keeps everything;
  Blightborn drops the belt too.
- **Backpacks.** The Woven Satchel (20 kg), the Hide Pack (26 kg) and the Explorer's
  Rucksack (32 kg, two safe slots).
- **Noise and Husks.** From day 3, Husks (the forest's dead, walking) roam between the old
  camps and crates in twos and threes. They hunt by sound: sprinting, a heavy pack, breaking
  a crate and forcing a lock all carry. Their salvage is good.
- **Salvage.** Break surplus scrap and packed-up defences into parts at the Tinker's Bench
  (half as much in the field). Packing a defence up by day now returns 60% of its materials.

### Hard Ground: a defence you have to think about
- **Root capacity.** The Heartwood can feed only so many roots. Each defence draws some (a
  barricade 1, a bow tower 3, a mortar 4), and **each upgrade tier draws one more**. The cap
  grows by two each night, with boons, and with relics you bury in the Heartwood. Craft cards
  show what a defence draws against what's free (red when it won't fit) and its damage type.
- **Damage types.** Pierce, blunt, fire and arc, and the Blight resist some and fear others.
  Rotboars shrug off arrows but break under mortar shells, Wisps barely notice blunt hits,
  Burrowers ground arcs, and Husks go up like kindling. Weak and strong hits show in their own
  colours.
- **Elite Blight.** From night 5 (Warden) some Blight come marked: Swift, Shielded, Thorned,
  Rooted and more, each with an outline and its mark on a plate above its health bar. They're
  tougher, and they drop better things.
- **They look for your weak side.** From night 3 the packs lean on the open rift your towers
  cover least, and you're told which side they're testing.
- **The surge.** From night 6 a fourth pack pours from every rift at once, growing each night.
- **The camp sits closer in**, so the tower ring around the Heartwood is free to build on.

### The Lost Expedition: a story in ten nights
- **Torn pages.** Twelve pages of the 1931 expedition (Dr. Iris Vane, Ruiz, Hollis) are
  scattered through camps, wrecks and caches. The first one you search always holds one. Read
  them again in the satchel's **Notes** tab. Two of them are maps that mark a cache.
- **The seals.** Three seals stand in the temple, the shrine and the ruins. Set a relic in
  one and the rift it guards sleeps for two nights. Gold closes it for good. A set seal wears a
  column of the Heartwood's own light.
- **Grafts.** Set the Thornback's heart into the Workbench and it learns to graft: a lens
  (+20% range), a resin drip (sets the Blight alight), a coiled spring (faster), bog heads
  (through armour) and a root anchor (mends itself). A tier 2 tower takes one, a tier 3 two.
  Grafts only turn up once you can use them.
- **Hollis's radio.** Mend it at the Tinker's Bench, one part at a time (a lamp lights on the
  set for each). Every part calls a **supply drop** at noon: a crate on a red flare out in the
  forest, with Husks already closing in.
- **The Rot.** From the dawn after night 5 the ground round every live rift starts to die,
  spreading further each day. On it the plants wither, the Blight run faster, and a tower's
  roots choke (it breathes out violet spores and fires slower). Fire burns it back, and a
  **Heartseed** sapling pushes it out for good.
- **Signs.** Some nights carry a Sign, shown on the day line beforehand and on the night's
  banner:
  - **Pale Fog**: your towers see less far.
  - **Blood Moon**: the Blight run faster and drop double (when you hold the idol).
  - **Stillness**: the Wisps can't fly.
  - **The Swarm**: twice the Blightlings, half as tough.
- **The Rot Mother.** Night 10 now belongs to her: a swollen brood queen who lays eggs as she
  walks. Burn the eggs or cut them before they hatch. In endless she returns every fifth
  night with a Thornback at her side.
- **Two endings.** At first light after night 10 the rescue plane comes: fly out, or stay
  with the Heartwood. For the true ending, set the golden idol home in the Sun Seal and hold
  the ten nights. The idol has to answer a Blood Moon in your hands first: carry it and the
  next Sign night is a Blood Moon.

### The Long Tail
- **Accessibility.** Captions for the sounds that matter (the horn, a roar, the Heartwood
  bitten, a Husk creaking), and switches for screen shake, head bob and **colour-blind
  Blight** (amber and blue outlines, a blue and orange placement ghost).
- **Rebind any key** on the Controls page. Taking a key another action uses swaps them, so
  nothing is ever left without a key, and the prompts and the journal name the keys you chose.
- **Gamepad (partial).** Sticks to move and look, triggers to swing and use, and the bumpers
  step along the belt. The menus, Settings, the boon picks, the intro and ending cards all
  work with the d-pad and A/B. The satchel and crafting still need a mouse.
- **Achievements.** Twenty of them, on the title's Records page, with a toast when one lands.
- **Daily vigil.** One world a day, the same for everyone (Warden, the starter kit, no
  Memories), with its own save and best.
- **Score.** Every vigil is scored (nights, kills, bosses, difficulty). Your best and your
  daily best are kept in Records.
- **A guided first night**, and a word the first time something new turns up (an elite, a
  heavy pack, the Heartwood bitten), told once.
- **Capture mode** (F8): a free camera for screenshots and trailers. P holds the world still
  and the wheel sets the speed. F9 hides the HUD on its own.
- **Smaller downloads.** The Blender models are compressed with meshopt: 11.6 MB → 5.7 MB.
- **Lighter Blight.** Each creature drew every coloured piece of its body separately: a
  Blightling cost 24 draws, a Thornback 36. Each moving part is now one draw (8 and 9), so a
  big night is far cheaper, and the camp, temple and wreck all sit under budget.

### Fixes
- Slows from the Spore Mortar, snares and roots took no effect. They work again.
- The boss bar and banner named the Rot Mother "the Thornback".
- A rare crash compiling a material that had already gone (a Husk crumbling at dawn).
- The "testing your side" warning now runs on the game clock, so pausing holds it.
- Spitters and Burrowers no longer hitch the frame the first time they appear.
- A daily vigil could fail to load on some dates (the drowned grove found nowhere to lie).
- At the temple altar the idol stayed on its pedestal after you took it, and the altar's
  search hid the Sun Seal.
- Capture mode dragged the player along with the camera (picking things up as it flew).
- The true-ending achievement only appeared at some later dawn; "Heart-eater, Eaten" now needs
  a Thornback.
- The first night's tips said your tower was firing when none was built; they now follow
  the night's clock, and the poultice tip waits until you're hurt.
- Colour-blind mode now covers the elites' outlines too, and recolours Blight already out.
- The boss bar no longer sits on top of banners or stays up on the defeat card.
- A Bloom sprouting was captioned as a hiss.

## 0.9.2 (2026-10-15)

- **FPS counter.** Turn on **Show FPS** in Settings to see frames a second and frame time in
  the top-left corner while you play: green at 50 and up, yellow from 30, red below that.

## 0.9.1: Steady Ground (2026-10-15)

A performance and quality-of-life patch: the game runs cooler and smoother on every machine,
picks sensible settings for laptops, the whole forest floor has depth, and it's much clearer
what to do and what you're missing.

### Runs better
- **Frame limit.** The game no longer draws a frame on every refresh of a fast monitor (144 a
  second on a 144 Hz screen). It now runs at **60** by default, and drops to 30 while paused
  or in another window. Choose 30, 60, 120 or Off in Settings.
- **Quality that fits your machine.** The first time you play, the game picks Low, Medium or
  High from your graphics card. Integrated and laptop graphics start on Low.
- **Low and Medium do much more.** Low loads its textures at half size (about 170 MB less
  video memory), uses fewer lights, redraws shadows less often and draws small plants less
  far, with the haze hiding where they stop. Medium uses lighter shadows and half-size leaf
  normal maps. Low runs at about half the cost of High. Texture detail changes when you
  restart.
- **Fewer stutters.**
  - The sky's lighting used to rebuild with a brief hitch every second or two through the
    day. It no longer does.
  - The first time a Blight Bloom came into view, the game froze for a moment. Its look is
    now prepared in the background.
  - Much less memory churn every frame, so fewer clean-up pauses.
- **Less wasted drawing.** Small things on the ground and far bushes no longer cast unseen
  shadows, and the ground skips the parts hidden behind plants.
- Sprinting through fresh forest on this test machine: typical frames 7.3 → 6.0 ms, and the
  slowest 1% of frames 27 → 18 ms.

### The ground
- **Depth on all of it.** Turf, moss, bare earth, mud and gravel now have the same raised,
  self-shadowed relief as the leaf litter, instead of looking painted on (Medium and High).

### Knowing what to do
- **"Keep the Heartwood alive."** Your first new run opens with a short card on what the vigil
  is: gather by day, craft defences in your satchel, build them around the Heartwood, hold
  the night. Find it again under **How to Play** on the pause menu.
- **The satchel is always one key away.** A **Tab · Satchel** tag sits beside your belt, and
  it glows and tells you when you have enough to craft a defence.
- **Hover a recipe to see what you're missing.** A tooltip lists every ingredient with how
  many you carry against how many it needs, what's still missing, and where to find each
  missing thing (on the forest floor, cutting bushes, from Blightlings...).
- **Costs show what you carry.** A recipe that needs 2 sticks when you hold 10 now reads
  `10/2`, not `2/2`.
- The satchel's item details say where a material is found.
- **A bigger journal**, and its first steps now say why you're building.

## 0.9: Wild Places (2026-10-15)

The Long Vigil and Wild Places in one update: a second region to explore, a forest that
remembers where the Blight walked, the last primitive props rebuilt in Blender, a game that
runs about twice as fast in the forest, and everything from the 0.8 preview, finished.

### The drowned grove
- **A second region** about 200 m from the Heartwood: a sunken stretch of the forest gone to
  black water. Mangroves stand on arching prop roots, reed beds and cattails crowd the
  shallows, water lilies float on still pools and drowned trees stand bleached and snapped.
- **Its own air.** Walk in and the fog closes in, grey-green and thick. The water is black
  with tannin, so nothing shows through it.
- **Its own forage.** Cut **reeds** (they thatch and lash into anything), catch **bog eels**
  in the shallows, and pick **bog iron** out of the mud.
  - New recipes: **Smoked Eel** (an eel and a strip of bark: heals 75) and **Iron Shot** (one
    bog iron makes five scrap shot for the slingshot).
  - Bog iron is what a barricade's third tier now needs (with reeds), and Burrowers sometimes
    drop it.
- **The Sunken Shrine** at its heart: a drowned stone platform with fallen pillars and a
  glowing altar. Search it for a jade figurine and rare parts.
- **A rift in the grove.** From night 4 a sixth rift tears open in the drowned grove, and its
  Blight wade in out of the water.

### A forest that remembers
- **Trampled lanes.** The Blight wear paths into the ground. At dawn the routes they walked
  hardest are churned to bare earth, the grass and leaf litter gone from them. Old lanes fade
  over a few days unless they're walked again, so you can read last night's attack in the
  morning. The lanes are kept in the save.

### Rebuilt in Blender
- **The camp tent:** sagging, wrinkled canvas on poles and guy lines, one flap rolled up, a
  bedroll, a pack, a mug and a coil of rope inside.
- **The plane wreck:** a dented, rust-streaked fuselage nosed into the earth, broken ribs and
  windscreen, a cargo door, one wing with its engine and bent prop, a torn-off tail, scattered
  debris, and moss and vines taking it back.
- **Supply crates** in two kinds, stencilled planks or strapped and latched. They still smash.
- **The Heartwood's** moss lumps are now soft cushions with tufts on its steps and stones, and
  its glowing veins are round cords with bright beads.

### Smoother
- **About twice as fast in the forest.** The plants were most of the cost of a frame:
  - Every plant of a kind is drawn together across the whole area in view (around 200 draw
    calls, from up to 790).
  - Trees and big leafy plants past about 38 m swap to a lighter copy with fewer, larger leaf
    cards. It's hard to spot through the haze, and it halves the triangles drawn.
  - Small plants and forage stop drawing where they'd only be a few pixels.
  - On this machine a frame in the forest went from 16 ms to 9 ms.
- **Steady frame rate** (Settings, on by default): when frames run slow the scene is drawn at
  a slightly lower resolution, and sharpens again when there's room.
- Fewer hitches: the compass no longer forces a page layout every frame, and release builds
  skip a slow shader check.
- **Fixed:** forage on the ground could render black.

### New Blight (from the 0.8 preview)
- **Spitters** (from night 3). Squat things carrying a sac of glowing green bile. They stop
  well out of reach behind the pack and lob globs at your towers, which burn on the ground
  for a few seconds after. They barely fight up close: run them down with the machete.
- **Burrowers** (from night 6). Armoured grubs with shovel claws. Put a wall between one and
  the Heartwood and it goes under, a ridge of earth racing past your defences, then bursts
  up on the far side. Nothing can hit it while it's underground.
- The first night each kind of Blight comes, a note tells you what it does.

### New defence: the Glowcap Lantern
- A cage of glowcaps hung from a lashed pole (2 glowcaps, 4 sticks, resin and fibre). Blight
  in its cold blue light take **25% more damage** (more with each upgrade), and a Burrower
  tunnelling into it is **dragged up and dazed**.

### Memories of the Heartwood
- Your lifetime records now unlock **Memories**, permanent and for every vigil after:
  - *The Old Sling* (hold through night 3): start with a slingshot and stones.
  - *Glowcap Lore* (burn 5 Blight Blooms): start with a Glowcap Lantern.
  - *A Fourth Card* (fell 150 Blight): the Heartwood offers four boons, not three.
  - *The Thornback's Hide* (slay a Thornback): three new boons join the pool: **Ember Heart**
    (Blight that bite the Heartwood catch fire), **Deep Roots** (your buildings mend at every
    dawn) and **Lantern Bearer** (lanterns shine further and expose more).
  - *The Heartwood in Bloom* (win a vigil): start with an Orchid Salve and two more poultices.
  - *Many Paths* (win a vigil on Warden or Blightborn): **choose how a vigil starts.** New
    Game shows three kits under the difficulty: the difficulty's own, a **Builder's Kit**
    (3 barricades, a spore mortar and logs) or a **Hunter's Kit** (slingshot, 20 stones, two
    firepots, three poultices).
- They're listed on the Records page with what each one needs, and New Game shows what you
  carry in. A message tells you when you earn one.

### Nights
- Night no longer looks like tinted day. The moonlit fill is lower, so fires, lanterns and the
  Heartwood light the clearing, while the Blight's glowing outlines still carry. Daytime is
  unchanged.

### Field Guide, Journal and balance
- The Field Guide has the Spitter, the Burrower and the lantern, and shows Memory-only boons
  as locked until you earn them.
- Two new Journal goals once you've met them: raise a Glowcap Lantern after your first
  Burrower night, and fell a Spitter with the machete after your first Spitter night.
- **Spitters are easier to answer.** 60 HP, a bit less damage to buildings, and bow towers
  now pick them out first, so a covered tower rarely loses a fight with one.
- **Rotboars** break off for towers from a little closer (4.5 m, was 6), and the
  **Thornback's slam** does 85 to buildings (was 110). The first Thornback, on night 5, comes
  at 70% of its health (was 80%), since that night now has a sixth rift.
- Measured with nobody fighting: Warden holds night 6 with a middling defence and night 10
  with a strong one; Verdant comfortably; Blightborn asks for more.

## 0.7: The Title (2026-10-14)

Overgrowth now opens like a finished game instead of dropping you into a single run.

### A new front door
- **A live title screen.** Behind the menu the camera drifts round the Heartwood at sunset:
  low gold light through the crowns, god rays, the heart glowing. It cuts slowly through
  three shots. The menu sits on the left with a new sigil and wordmark, drifting spores of
  light and a touch of film grain.
- **Press any key.** Loading shows the sigil and a bar, then the forest fades up behind the
  logo and waits for you.
- **Title music.** A slow pad and a kalimba line picking over it, synthesised live like every
  other sound. It fades out as you leave.
- **The fly-in.** Choose Continue or New Game and the menu dissolves, the camera swoops down
  to your eyes, dips to black and you wake at dawn.

### More than one way to play
- **Three difficulties.** *Verdant* (fewer, frailer Blight, a 700 HP Heartwood, two towers to
  start), *Warden* (the game as it was) and *Blightborn* (Blight 30% tougher and 25% more of
  them, a 400 HP Heartwood, no poultices). You choose when a run starts, and it's kept in
  the save.
- **Continue shows your vigil:** the day, difficulty, the Heartwood's health, nights held,
  Blight felled, buildings standing, your boons and when it was saved.
- **Field Guide.** Studio portraits of every Blight and defence. The Blight have lore, stats
  and field notes, and stay as silhouettes until you've met them. Defences show their stats,
  what they're good against and their recipe. All 18 boons are listed too.
- **Records.** Lifetime totals across every run: vigils begun, nights held, Blight felled,
  Thornbacks slain, Blooms burned, buildings raised, Heartwoods bloomed and your bests.
- **Settings** has its own page: quality, glow, mouse sensitivity, **invert look** and
  **volume** (both new), and title music on or off. **Controls** and **Credits** pages too.

### In the game
- **A proper pause menu.** Esc shows the day, the time and tonight's wave, with Resume, the
  Field Guide, Settings, Controls and Quit to Title (which saves first). The HUD steps aside
  while you're paused.
- The victory and game-over screens have a way back to the title.
- The whole menu works from the keyboard: arrows to choose, Enter to select, Esc to go back,
  left and right to pick a difficulty.

## 0.6: Blight Blooms (2026-10-14)

Grass in the clearings, a forest floor full of things to pick up, a sprint that doesn't look
silly, and a reason to go out hunting by day.

### Blight Blooms
- **Every dawn a few Blight Blooms sprout** out in the forest, 45-90 m from the Heartwood:
  glowing, vein-lit pods on a dark mound, soaking a purple stain into the soil, each watched by
  Blightlings that prowl round it. A faint column of spores rises over the trees, and the
  compass and map mark each one ✺.
- **Cut one down** (six machete blows, sling stones, or a firepot) and it bursts into rare loot
  (strange seeds, glowcaps, ghost orchids, tubes, sometimes a relic) and earns favour with the
  Heartwood toward your next boon. Its guards wither with it.
- **Leave it, and at dusk it opens:** all night it is one more mouth the wave pours out of, a
  new lane onto the Heart from wherever it stood. Cut it down in the dark and the lane closes.
  So each day is a choice: hunt the blooms, or build to cover the flank they'll open.
- One bloom on day 1, two on days 2-3, three after that.

### The world
- **Grass.** Open gaps in the jungle and the ring round the camp are meadows now: a new
  photographic turf, with real 3D grass out to 28 m that sways in the wind, parts as you walk
  through and whips when you swing. It grows in clumps and drifts, short lawn and long grass,
  golden in dry patches, and straggles out into the leaves at its edges.
- **The forest floor isn't one dark carpet any more.** The dark wet-leaf layer is gone; under
  the trees thin sedge breaks up the litter, and the riverbanks and the camp's trampled earth
  are lighter.
- **Thickets.** Tree ferns, bananas, aroids, saplings and big shrubs grow in clumps through the
  forest, so it closes into walls and corridors instead of an open grove of poles.
- **Much more to pick up.** About seven times as many loose things lie on the floor, in natural
  heaps: bundles of dead sticks, scatters of stones and flint, rings of mushrooms, bones and
  feathers where something ate, bark, vines and resin at the feet of the giants, berries, moss
  and fibre. The item you're looking at lights up with a glint, and plants no longer grow over
  them.
- Dead palm fronds no longer glow orange in the shade.

### Feel
- **Hold E to rake.** Tap E picks up what you're looking at; keep holding and you gather up
  everything loose within 3 m.
- **A better sprint.** The head bob now moves once per footstep (it ran four times too fast,
  a frantic jitter), the machete drops to a low carry at your side that swings with your
  stride, and the view widens a touch.
- **Sprint lasts longer** (about 8 s) and recovers faster. Running into a wall no longer bobs
  your head, plays footsteps or burns stamina.
- **Crates, urns and chests** show a mouse icon and "Swing to smash · 3 blows" instead of an
  E key, with a ring that fills as you hit them.

## 0.5: Sharp Edges (2026-10-14)

A new machete in a gloved hand, a jungle floor with real variety, and the same depth the
ground got in 0.4 now on bark and stone.

### The machete
- **A real machete, held in a real hand.** A long, broad blade of dark carbon steel with a
  bright filed edge, wooden scales with brass rivets and a leather thong, gripped in a worn
  leather work glove with a rolled canvas sleeve. It sits off to the right instead of
  standing in the middle of the screen like a sword.
- **New swings.** A forehand cut from over the right shoulder and a backhand from the left,
  with your arm following through. The blade leaves a faint smear of air behind it.
- **It hits what it hits.** Chips, sparks and splinters fly off the exact spot the blade
  struck, away from the surface.
- **Trees keep the scars.** Every blow cuts a notch of pale wood into the bark, and hacking at
  the same spot opens it wider. Stone keeps bright scrapes.
- **Wood grabs, stone rings.** The blade sinks into a trunk and has to be wrenched free; on
  rock it bounces back at you.
- **Plants react.** Everything in reach whips along with a swing and springs back. Plants
  lean aside as you push through them.
- **Cutting leaves a mark.** A cut plant is knocked over, lies on the ground for a few
  seconds, and leaves its sliced stalks standing.
- The blade no longer flares white when it catches the sun.
- **Swing at your feet** and the blade bites into the forest floor with a thud, kicking up
  leaves and dirt.
- **The slingshot is held in the same gloved hand**, with a leather pouch.

### The world
- **A forest floor that isn't one carpet.** The pale, identical leaves are gone. The floor is
  now a mix of many species' leaves in browns, russets and olives with a few still green,
  broken by patches of bare dark earth, roots and seedlings.
- **The camp is trampled earth** around the Heartwood.
- **Bark and stone have depth.** Tree trunks, logs, dead wood, rocks and the temple's stone
  now have the same parallax relief as the ground: fissures and cracks look deep up close.
- **New rock.** Rocks and cliffs are dry, fractured stone in angular plates instead of a
  pitted surface that read like foam.
- **Trees are no longer flat.** Crowns were big cards of leaves all facing the sky, so they
  looked like paper plates from below and cut-outs from the side. They are now fuller and
  rounder, with smaller sprays facing every way and crossed through each other. Bushes too.

## 0.4: The Living Floor (2026-10-14)

An art overhaul. The jungle used to look flat and smooth, like a photo of leaves pasted on a
hill. Now every surface is textured and has relief, and the forest floor is real at your feet.

### The world
- **New surfaces everywhere.** Leaf litter, moss, mud, gravel, rock, bark, dead wood and temple
  stone are all new photographic textures, each with its own relief.
- **A forest floor you can stand on.** The ground has depth: leaves overlap and cast small
  shadows on each other, and gaps between them fall into shade. The leaves are life-size, about
  10–30 cm (they used to be a metre long).
- **3D fallen leaves and sticks** lie on the ground around you, gathered in drifts. Seedlings,
  small ferns and dead fronds grow thickly within 25 m.
- **Hillsides** no longer smear the leaves into long streaks.
- **Soft, dappled shadows.** Sunlight through the canopy falls in soft flecks that sharpen where
  things touch the ground. The sharp leaf shapes printed on the floor are gone.
- **Giant trees** have six shapes with three kinds of crown. They grow low limbs, climbers and
  lianas, and stand on rebuilt buttress roots that flare, ripple and run down into the ground.
  Moss grows in patches on the damp side. Saplings no longer grow through their trunks.
- **Cliffs** break into stepped limestone ledges instead of one smooth wall. Moss wraps around
  rock edges and fills the cracks.
- **The temple** is built block by block: coursed walls, paved terraces, a grand stair and rubble
  at its foot. The summit shrine now has walls, a doorway, a pillared porch, a stepped roof and a
  roof comb.
- **Water** reflects the banks and trees around it.
- **Light and air.** Under the canopy the air is a deep, green shade. Sunbeams are beams, not a
  milky haze, and shadows are warm instead of teal.
- **Rain soaks the world.** In a downpour the ground, bark and stone turn dark and glossy, then
  dry out over a few minutes.
- **The machete throws real leaves.** Cut a plant and its leaves scatter with brown scraps of
  litter.
- New mushrooms, greener plant stems, and stone-textured bone and crust on the Blight.

### Gameplay
- **Five rifts.** Two more tear open during the run, on nights 7 and 9. The night they open, a
  banner warns you.
- **New boons that change the rules:**
  - *Splitting Shafts:* bow bolts split onto a second target.
  - *Last Bloom:* the Heartwood bursts once a night when it falls low.
  - *Grasping Roots:* roots seize the Blight closest to the Heart.
  - *Harvest Dawn:* towers bring in materials at dawn.
  - *Rotting Bloom:* slowed Blight burst into spores.
- **Rotboars** charge any tower that shoots them.
- **Balance.** The night-5 Thornback comes in lighter (it was the hardest night of the run).
  Nights 7–10 hit harder: Blight HP grows faster after night 6, and the surge is bigger.
- **Sticks and stones** lie near the Heartwood, so the first thing the journal asks for is close.
- A big relic offering can now earn several boons at once.

### Performance
- **Quality setting** (High / Medium / Low) on the menu, remembered between visits. Low drops
  ground relief, 3D litter, ambient occlusion, sunbeams and soft shadows.
- Shaders compile while the game loads, so the first ruin you find no longer freezes the game.
- The world streams in a little at a time, so walking into new ground hitches less. The temple
  builds four times faster.
- The shadow pass is cheaper to draw.

## 0.3: Hold the Heartwood (2026-10-13)

The big one. Overgrowth is now a complete run: ten nights, a boss, a win screen, and saves.

### New
- **Slingshot.** Craft it from sticks, vine and fiber. Hold the left mouse button to draw and
  release to fire. A full draw hits harder and can crit. Fire stones, or craft **scrap shot** (tin
  can + rusty bolts) for 1.6× damage.
- **Ember Brazier.** A short-range fire tower that sets the Blight burning and hits flyers.
- **Vine Snare.** Roots up to three Blight in place for 2.6 s, six times before it's spent.
- **Firepots.** Throw one with the right mouse button. It bursts into flame and leaves a burning
  patch for 5 s.
- **Orchid Salve.** Raise it to mend every building within 20 m, and the Heartwood.
- **Wisps.** Flying Blight from night 4. They ignore walls and circle the Heartwood before diving.
- **The Thornback.** A boss on nights 5 and 10. It slams the ground (a red ring warns you),
  calls in Blightlings, and has its own health bar.
- **Tower upgrades.** Hold **E** on a building to raise it to *Overgrown*, then *Heartbound*.
  Each tier hits harder, shoots faster and reaches further. Tier 3 bow towers loose two bolts.
- **Repairs.** Hold **E** on a damaged building to fix it with bark and resin (or sticks and
  thorns for walls).
- **Boons.** Offer relics at the Heartwood to earn favour, then pick one of three boons: sharper
  machete, longer tower reach, a tougher Heartwood, heal on kill, and more.
- **Rain nights.** Some nights roll in with rain and lightning. The Blight moves slower, but the
  night is darker and harder to read.
- **Winning.** Hold through night 10 to win the run. Carry on in endless mode if you like.
- **Saves.** The run saves at every dawn and every 30 s by day. **Continue** picks it back up.
  Your best run is kept on the menu.
- **Journal.** A short guide on your first day (forage, cut, build, craft, call the night), then
  rolling optional goals.
- **Glow setting.** Turn bloom on or off from the pause menu.

### Combat feel
- Blight now telegraph their attacks: they rear back and their outline flares before they bite,
  and the bite misses if you've stepped away.
- Blightlings pounce. Everything staggers and gets knocked back when hit.
- Machete hits pause the frame for a split second. Three clicked hits in a row land a heavy
  finisher.
- Damage numbers, health bars over hurt enemies and buildings, and a hitmarker.
- Enemies rise out of the ground when they spawn and burn away to ash when they die.
- Each night arrives in three waves from different rifts. The day banner and compass tell you
  what's coming.

### Looks
- Bloom on everything that glows: the Heartwood, rifts, fire, lightning.
- The Heartwood lights the clearing at night and sends a beam of light up you can see from
  far away.
- Rifts are now torn portals ringed with thorns.
- Blight get a faint violet outline at night so you can pick them out in the dark.
- A see-through preview when placing a building, with its range ring and the reach of the
  towers already standing.
- Reworked Spore Mortar, Tesla Totem, Blightling, Heartwood and cliff rock.

### Fixes
- No more multi-second freeze when the first night starts.
- No more stutter when you place, pack up or lose a building.
- The victory title no longer gets cut off.
- Picking a boon with 1–3 no longer also switches your belt slot.
- You can work on a building from a few steps back.
- You can no longer walk inside enemies.

## 0.2: Gather, craft, defend (2026-10-13)

- Overgrowth became a first-person tower defence. Gather by day, craft in the satchel, and
  defend the Heartwood from the Blight at night.
- An 8-slot belt plus a 24-slot pack, forest materials, foraging with **E**, and harvesting
  with the machete.
- Bramble Bow Tower, Spore Mortar, Tesla Totem, Thorn Barricade and Spike Trap.
- Blightlings and Rotboars follow the terrain to the Heartwood.

## 0.1: The jungle (2026-10-13)

- An endless procedural jungle to explore with a machete: cut through plants and scavenge
  camps, wrecks and temples.
- Jump, mouse and terrain fixes, and a reworked forest floor.
